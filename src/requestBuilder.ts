import * as aws from "aws-sdk";
import {TableSchema} from "./TableSchema";
import {
    checkCondition,
    checkConditions,
    checkSchema,
    checkSchemaItemAgreement,
    checkSchemaItemsAgreement,
    checkSchemaKeyAgreement,
    checkSchemaKeysAgreement,
    checkSchemaPartitionKeyAgreement,
    checkSchemaSortKeyAgreement,
    DynamoKey,
    DynamoKeyPair,
    DynamoQueryConditionOperator,
    operatorIsFunction
} from "./validation";
import {dynamoDbReservedWords} from "./dynamoDbReservedWords";
import {Condition} from "./Condition";
import {UpdateExpressionAction} from "./UpdateExpressionAction";

/**
 * Build a serialized item that can be put in DynamoDB.  This syntax is also used for
 * expression and key values.
 * @param tableSchema
 * @param item
 * @returns a put item
 */
export function buildRequestPutItem(tableSchema: TableSchema, item: any): aws.DynamoDB.AttributeValue {
    switch (typeof item) {
        case "boolean":
            return {BOOL: item};
        case "string":
            return {S: item};
        case "number":
            return {N: item.toString()};
        case "undefined":
        case "object": {
            if (!item) {
                return {NULL: true};
            } else if (item instanceof Buffer) {
                return {B: item.toString("base64")};
            } else if (item instanceof Uint8Array) {
                return {B: Buffer.from(item as any).toString("base64")};
            } else if (item instanceof Date) {
                if (tableSchema.dateSerializationFunction) {
                    return buildRequestPutItem(tableSchema, tableSchema.dateSerializationFunction(item));
                } else {
                    return {S: item.toISOString()};
                }
            } else if (item instanceof Set) {
                const items = Array.from(item);
                if (item.size == 0) {
                    throw new Error("Empty Sets are not supported.")
                }

                if (items.every(x => typeof x === "string")) {
                    return {SS: items.map(s => s.toString())};
                }
                if (items.every(x => typeof x === "number")) {
                    return {NS: items.map(n => n.toString())};
                }
                if (items.every(x => x instanceof Buffer)) {
                    return {BS: items.map(b => b.toString("base64"))};
                }
                if (items.every(x => x instanceof Uint8Array)) {
                    return {BS: items.map(b => Buffer.from(b).toString("base64"))};
                }

                throw new Error(`Set [${items.slice(0, 10).map(i => typeof i).join(",")}] cannot be serialized into a request object.`);
            } else if (Array.isArray(item)) {
                return {L: item.map(i => buildRequestPutItem(tableSchema, i))};
            } else {
                const valueMap: aws.DynamoDB.MapAttributeValue = {};
                Object.keys(item).forEach(key => valueMap[key] = buildRequestPutItem(tableSchema, item[key]));
                return {M: valueMap};
            }
        }
        default:
            // "symbol", "function"
            throw new Error(`Type ${typeof item} cannot be serialized into a request object.`);
    }
}

/**
 * Build a request object that can be passed into `getItem`.
 * @param tableSchema
 * @param partitionKeyValue the key of the item to get
 * @param sortKeyValue sort key of the item to get, if set in the schema
 * @returns input for the `getItem` method
 */
export function buildGetInput(tableSchema: TableSchema, partitionKeyValue: DynamoKey, sortKeyValue?: DynamoKey): aws.DynamoDB.GetItemInput {
    checkSchema(tableSchema);
    checkSchemaKeyAgreement(tableSchema, partitionKeyValue, sortKeyValue);

    return {
        Key: getKey(tableSchema, partitionKeyValue, sortKeyValue),
        TableName: tableSchema.tableName
    };
}

/**
 * Build a request object that can be passed into `putItem`.
 *
 * If `TableSchema.versionKeyField` is set the put will only succeed
 * if the item in the database has the same value (and then the version
 * will be incremented).
 * @param tableSchema
 * @param item
 * @returns input for the `putItem` method
 */
export function buildPutInput(tableSchema: TableSchema, item: object): aws.DynamoDB.PutItemInput {
    checkSchema(tableSchema);
    checkSchemaItemAgreement(tableSchema, item);

    const request: aws.DynamoDB.PutItemInput = {
        Item: buildRequestPutItem(tableSchema, item).M,
        TableName: tableSchema.tableName
    };

    if (tableSchema.versionKeyField) {
        request.ExpressionAttributeNames = {};
        request.ExpressionAttributeValues = {};
        const versionAttributeName = getExpressionAttributeName(request.ExpressionAttributeNames, tableSchema.versionKeyField);

        if (item[tableSchema.versionKeyField] != null) {
            // Require the existing table item to have the same old value, and increment
            // the value we're putting.  This is the crux of the optimistic locking.
            request.ConditionExpression = `${versionAttributeName} = ${getExpressionValueName(tableSchema, request.ExpressionAttributeValues, item[tableSchema.versionKeyField])}`;
            request.Item[tableSchema.versionKeyField] = buildRequestPutItem(tableSchema, item[tableSchema.versionKeyField] + 1);
        } else {
            // If the version key isn't set then we must be putting a brand new item,
            // or versioning has just been enabled.
            request.ConditionExpression = `attribute_not_exists(${versionAttributeName})`;
            request.Item[tableSchema.versionKeyField] = buildRequestPutItem(tableSchema, 1);
        }
    }

    if (tableSchema.ttlField && item.hasOwnProperty(tableSchema.ttlField)) {
        if (item === null || typeof item[tableSchema.ttlField] === "number") {
            // No-op because it was already serialized correctly.
            // I'm waffling on trying to re-interpret unix-epoch millisecond dates as seconds since
            // the difference is 1000.  I'm worried about the potential for confusing results though.
        } else if (item[tableSchema.ttlField] instanceof Date) {
            request.Item[tableSchema.ttlField] = buildRequestPutItem(tableSchema, Math.round((item[tableSchema.ttlField] as Date).getTime() / 1000));
        } else {
            // We could try to interpret strings as Dates and then use that, but is that really
            // a convenience?  In what scenario would someone really want to put strings here?
            // It seems easier to hit the validation error once and then use Dates.
            throw new Error("Unhandled case that should have been caught in validation.");
        }
    }

    return request;
}

/**
 * Build a request object that can be passed into `updateItem` based upon a
 * set of {@link UpdateExpressionAction}s.  Each {@link UpdateExpressionAction} defines
 * an operation to take as part of updating in the database.
 *
 * If `TableSchema.versionKeyField` is set the update will only succeed
 * if the item in the database has the same value (and then the version
 * will be incremented).
 * @param tableSchema
 * @param itemToUpdate the item being updated.  This item is only used for its
 *        keys and may already be updated.  This item will not be modified.
 * @param updateActions an array of actions to turn into an UpdateExpression
 * @returns input for the `updateItem` method
 */
export function buildUpdateInputFromActions(tableSchema: TableSchema, itemToUpdate: object, ...updateActions: UpdateExpressionAction[]): aws.DynamoDB.UpdateItemInput {
    checkSchema(tableSchema);
    checkSchemaItemAgreement(tableSchema, itemToUpdate);

    const nameMap: aws.DynamoDB.ExpressionAttributeNameMap = {};
    const valueMap: aws.DynamoDB.ExpressionAttributeValueMap = {};
    let conditionExpression: string = undefined;

    if (tableSchema.versionKeyField) {
        if (itemToUpdate[tableSchema.versionKeyField] == null) {
            throw new Error("The tableSchema defines a versionKeyField but itemToUpdate does not have a value for that field.  As an existing item to update it should already have a version.");
        }

        updateActions = [...updateActions, {
            action: "number_add",
            attribute: tableSchema.versionKeyField,
            value: 1
        }];
        conditionExpression = `${getExpressionAttributeName(nameMap, tableSchema.versionKeyField)} = ${getExpressionValueName(tableSchema, valueMap, itemToUpdate[tableSchema.versionKeyField])}`;
    }

    const setActions = updateActions
        .filter(action => getUpdateExpressionActionClauseKey(action) === "SET")
        .map(action => {
            const attributeName = getExpressionAttributeName(nameMap, action.attribute);
            switch (action.action) {
                case "put":
                    return `${attributeName} = ${getExpressionValueName(tableSchema, valueMap, action.value)}`;
                case "put_if_not_exists":
                    return `${attributeName} = if_not_exists(${attributeName}, ${getExpressionValueName(tableSchema, valueMap, action.value)})`;
                case "number_add":
                    // This could also be handled by the "ADD" clause but I think that's more likely
                    // to have unexpected side-effects if the item's value is not a number.
                    return `${attributeName} = ${attributeName} + ${getExpressionValueName(tableSchema, valueMap, action.value)}`;
                case "number_subtract":
                    return `${attributeName} = ${attributeName} - ${getExpressionValueName(tableSchema, valueMap, action.value)}`;
                case "list_append":
                    return `${attributeName} = list_append(${attributeName}, ${getExpressionValueName(tableSchema, valueMap, action.values)})`;
                case "list_prepend":
                    return `${attributeName} = list_append(${getExpressionValueName(tableSchema, valueMap, action.values)}, ${attributeName})`;
                case "list_set_at_index":
                    return `${attributeName}[${action.index}] = ${getExpressionValueName(tableSchema, valueMap, action.value)}`;
                default:
                    throw new Error(`Unhandled SET update '${action.action}'.`);
            }
        })
        .join(", ");

    const removeActions = updateActions
        .filter(action => getUpdateExpressionActionClauseKey(action) === "REMOVE")
        .map(action => {
            const attributeName = getExpressionAttributeName(nameMap, action.attribute);
            switch (action.action) {
                case "remove":
                    return attributeName;
                case "list_remove_at_index":
                    return `${attributeName}[${action.index}]`;
                default:
                    throw new Error(`Unhandled REMOVE update '${action.action}'.`);
            }
        })
        .join(", ");

    const addActions = updateActions
        .filter(action => getUpdateExpressionActionClauseKey(action) === "ADD")
        .map(action => {
            const attributeName = getExpressionAttributeName(nameMap, action.attribute);
            switch (action.action) {
                case "set_add":
                    return `${attributeName} ${getExpressionValueName(tableSchema, valueMap, action.values)}`;
                default:
                    throw new Error(`Unhandled ADD update '${action.action}'.`);
            }
        })
        .join(", ");

    const deleteActions = updateActions
        .filter(action => getUpdateExpressionActionClauseKey(action) === "DELETE")
        .map(action => {
            const attributeName = getExpressionAttributeName(nameMap, action.attribute);
            switch (action.action) {
                case "set_delete":
                    return `${attributeName} ${getExpressionValueName(tableSchema, valueMap, action.values)}`;
                default:
                    throw new Error(`Unhandled DELETE update '${action.action}'.`);
            }
        })
        .join(", ");

    const updateExpression = (
        (setActions ? "SET " + setActions : "")
        + (removeActions ? "REMOVE " + removeActions : "")
        + (addActions ? "ADD " + addActions : "")
        + (deleteActions ? "DELETE " + deleteActions : "")
    ).trim();

    const request: aws.DynamoDB.UpdateItemInput = {
        ExpressionAttributeNames: nameMap,
        ExpressionAttributeValues: valueMap,
        UpdateExpression: updateExpression,
        Key: getKey(tableSchema, itemToUpdate[tableSchema.partitionKeyField], tableSchema.sortKeyField && itemToUpdate[tableSchema.sortKeyField]),
        TableName: tableSchema.tableName
    };

    if (conditionExpression) {
        request.ConditionExpression = conditionExpression;
    }

    return request;
}

export function buildUpdateInputFromDiff(tableSchema: TableSchema, originalItem: object, updatedItem: object): aws.DynamoDB.UpdateItemInput {
    const actions: UpdateExpressionAction[] = [];

    // TODO diff the objects and generate a set of changes

    return buildUpdateInputFromActions(tableSchema, originalItem, ...actions);
}

function getUpdateExpressionActionClauseKey(action: UpdateExpressionAction): "SET" | "REMOVE" | "ADD" | "DELETE" {
    const actions: (UpdateExpressionAction["action"])[] = ["put", "put_if_not_exists", "number_add", "number_subtract", "list_append", "list_prepend", "list_set_at_index", "remove", "list_remove_at_index", "set_add", "set_delete"];

    switch (action.action) {
        case "put":
        case "put_if_not_exists":
        case "number_add":
        case "number_subtract":
        case "list_append":
        case "list_prepend":
        case "list_set_at_index":
            return "SET";
        case "remove":
        case "list_remove_at_index":
            return "REMOVE";
        case "set_add":
            return "ADD";
        case "set_delete":
            return "DELETE";
        default:
            throw new Error(`UpdateExpression action must be one of: ${actions.join(", ")}.`);
    }
}

/**
 * Build a request object that can be passed into `deleteItem`
 *
 * If `TableSchema.versionKeyField` is set the delete will only succeed
 * if the item in the database has the same value.
 * @param tableSchema
 * @param itemToDelete the item to delete.  Must at least have the partition
 *        key, the sort key if applicable, and the version field if applicable.
 * @returns input for the `deleteItem` method
 */
export function buildDeleteInput(tableSchema: TableSchema, itemToDelete: object): aws.DynamoDB.DeleteItemInput {
    checkSchema(tableSchema);
    checkSchemaItemAgreement(tableSchema, itemToDelete);

    const request: aws.DynamoDB.DeleteItemInput = {
        Key: getKey(tableSchema, itemToDelete[tableSchema.partitionKeyField], tableSchema.sortKeyField && itemToDelete[tableSchema.sortKeyField]),
        TableName: tableSchema.tableName
    };

    if (tableSchema.versionKeyField) {
        request.ExpressionAttributeNames = {};
        request.ExpressionAttributeValues = {};
        request.ConditionExpression = `${getExpressionAttributeName(request.ExpressionAttributeNames, tableSchema.versionKeyField)} = ${getExpressionValueName(tableSchema, request.ExpressionAttributeValues, itemToDelete[tableSchema.versionKeyField])}`;
    }

    return request;
}

/**
 * Build a request object that can be passed into `query`.  The query operation performs
 * an efficient search on one partition key value with an optional condition on the sort
 * key.
 *
 * If `tableSchema.indexName` is set the query will be performed on the secondary index
 * with that name.
 * @param tableSchema
 * @param partitionKeyValue the hash key of the item to get
 * @param sortKeyOp the operator that can be used to constrain results.  Must be one of:
 *                  `"=", "<", "<=", ">", ">=", "BETWEEN", "begins_with"`.  If not defined
 *                  all sort key values will be returned.
 * @param sortKeyValues values the sortKeyOp works on.  This must be 2 values for
 *                      `BETWEEN` and 1 for all other operators.
 * @returns input for the `query` method
 */
export function buildQueryInput(tableSchema: TableSchema, partitionKeyValue: DynamoKey, sortKeyOp?: DynamoQueryConditionOperator, ...sortKeyValues: DynamoKey[]): aws.DynamoDB.QueryInput {
    checkSchema(tableSchema);
    checkSchemaPartitionKeyAgreement(tableSchema, partitionKeyValue);
    if (!tableSchema.sortKeyField) {
        throw new Error("TableSchema doesn't define a sortKeyField and the query operation is only possible when one is defined.");
    }
    if (sortKeyOp) {
        checkCondition({
            attribute: tableSchema.sortKeyField,
            operator: sortKeyOp,
            values: sortKeyValues
        }, "query");
    }

    const queryInput: aws.DynamoDB.QueryInput = {
        TableName: tableSchema.tableName,
        ExpressionAttributeNames: {
            "#P": tableSchema.partitionKeyField
        },
        ExpressionAttributeValues: {
            ":p": buildRequestPutItem(tableSchema, partitionKeyValue)
        },
        KeyConditionExpression: `#P = :p`
    };

    if (tableSchema.indexName) {
        queryInput.IndexName = tableSchema.indexName;
    }

    if (sortKeyOp) {
        for (const val of sortKeyValues) {
            checkSchemaSortKeyAgreement(tableSchema, val);
        }
        if (sortKeyOp === "begins_with" && tableSchema.sortKeyType !== "string") {
            throw new Error("The begins_with query operator can only be used when sortKeyType is 'string'.");
        }

        queryInput.ExpressionAttributeNames["#S"] = tableSchema.sortKeyField;
        const valueNames = getExpressionValueNames(tableSchema, queryInput.ExpressionAttributeValues, sortKeyValues);

        if (sortKeyOp === "BETWEEN") {
            // This isn't worth generalizing because it's not like other operators.
            queryInput.KeyConditionExpression += ` AND #S BETWEEN ${valueNames[0]} AND ${valueNames[1]}`;
        } else if (operatorIsFunction(sortKeyOp)) {
            queryInput.KeyConditionExpression += ` AND ${sortKeyOp}(#S, ${valueNames[0]})`;
        } else {
            queryInput.KeyConditionExpression += ` AND #S ${sortKeyOp} ${valueNames[0]}`;
        }
    }

    return queryInput;
}

/**
 * Build a request object that can be passed into `scan`.  The scan operation performs
 * a linear search through all objects in the table.  It can be filtered to only return
 * some values, though all objects in the database will still be read and your account
 * billed accordingly.
 *
 * If `tableSchema.indexName` is set the scan will be performed on the secondary index
 * with that name.
 * @see addFilter
 * @param tableSchema
 * @param filters one or more filters to turn into a filter expression
 * @returns input for the `scan` method
 */
export function buildScanInput(tableSchema: TableSchema, ...filters: Condition[]): aws.DynamoDB.ScanInput {
    checkSchema(tableSchema);

    let scanInput: aws.DynamoDB.ScanInput = {
        TableName: tableSchema.tableName
    };

    if (tableSchema.indexName) {
        scanInput.IndexName = tableSchema.indexName;
    }

    if (filters.length) {
        scanInput = addFilter(tableSchema, scanInput, ...filters);
    }

    return scanInput;
}

/**
 * Build a request object that can be passed into `batchWriteItem`.
 * @param tableSchema
 * @param items the items to put
 * @returns input for the `batchWriteItem` method
 */
export function buildBatchPutInput(tableSchema: TableSchema, items: object[]): aws.DynamoDB.BatchWriteItemInput {
    checkSchema(tableSchema);
    checkSchemaItemsAgreement(tableSchema, items);

    if (tableSchema.versionKeyField) {
        throw new Error("TableSchema defines a versionKeyField.  Optimistic locking can not be supported in this request.");
    }

    return {
        RequestItems: {
            [tableSchema.tableName]: items.map(item => ({
                PutRequest: {
                    Item: buildRequestPutItem(tableSchema, item).M
                }
            }))
        }
    };
}

/**
 * Build a request object that can be passed into `batchWriteItem`.
 * @param tableSchema
 * @param keyValues an array of the key values for each item to delete
 * @returns input for the `batchWriteItem` method
 */
export function buildBatchDeleteInput(tableSchema: TableSchema, keyValues: DynamoKey[] | DynamoKeyPair[]): aws.DynamoDB.BatchWriteItemInput {
    checkSchema(tableSchema);
    checkSchemaKeysAgreement(tableSchema, keyValues);

    if (tableSchema.sortKeyType) {
        const keyPairs = keyValues as DynamoKeyPair[];
        return {
            RequestItems: {
                [tableSchema.tableName]: keyPairs.map(keyPair => ({
                    DeleteRequest: {
                        Key: {
                            [tableSchema.partitionKeyField]: buildRequestPutItem(tableSchema, keyPair[0]),
                            [tableSchema.sortKeyField]: buildRequestPutItem(tableSchema, keyPair[1])
                        }
                    }
                }))
            }
        };
    } else {
        const flatKeys = keyValues as DynamoKey[];
        return {
            RequestItems: {
                [tableSchema.tableName]: flatKeys.map(key => ({
                    DeleteRequest: {
                        Key: {
                            [tableSchema.partitionKeyField]: buildRequestPutItem(tableSchema, key)
                        }
                    }
                }))
            }
        };
    }
}

/**
 * Build a request object that can be passed into `batchGetItem`.
 * @param tableSchema
 * @param keyValues an array of the key values for each item to request
 * @returns input for the `batchGetItem` method
 */
export function buildBatchGetInput(tableSchema: TableSchema, keyValues: DynamoKey[] | DynamoKeyPair[]): aws.DynamoDB.BatchGetItemInput {
    checkSchema(tableSchema);
    checkSchemaKeysAgreement(tableSchema, keyValues);

    if (tableSchema.sortKeyType) {
        const keyPairs = keyValues as DynamoKeyPair[];
        return {
            RequestItems: {
                [tableSchema.tableName]: {
                    Keys: keyPairs.map(keyPair => ({
                        [tableSchema.partitionKeyField]: buildRequestPutItem(tableSchema, keyPair[0]),
                        [tableSchema.sortKeyField]: buildRequestPutItem(tableSchema, keyPair[1])
                    }))
                }
            }
        };
    } else {
        const flatKeys = keyValues as KeyType[];
        return {
            RequestItems: {
                [tableSchema.tableName]: {
                    Keys: flatKeys.map(key => ({
                        [tableSchema.partitionKeyField]: buildRequestPutItem(tableSchema, key)
                    }))
                }
            }
        };
    }
}

/**
 * Build a request object that can be passed into `createTable`.
 * @param tableSchema
 * @param readCapacity represents one strongly consistent read per second, or two
 *                     eventually consistent reads per second, for an item up to 4 KB in size.
 * @param writeCapacity represents one write per second for an item up to 1 KB in size.
 * @returns input for the `createTable` method
 */
export function buildCreateTableInput(tableSchema: TableSchema, readCapacity: number = 1, writeCapacity: number = 1): aws.DynamoDB.CreateTableInput {
    if (tableSchema.indexName) {
        throw new Error("tableSchema.indexName is set, implying this is a schema for a secondary index.  buildCreateTableInput() is for creating a table and its primary index.");
    }
    if (!Number.isInteger(readCapacity) || readCapacity < 1) {
        throw new Error("readCapacity must be a positive integer.");
    }
    if (!Number.isInteger(writeCapacity) || writeCapacity < 1) {
        throw new Error("writeCapacity must be a positive integer.");
    }

    checkSchema(tableSchema);

    const request: aws.DynamoDB.CreateTableInput = {
        AttributeDefinitions: [
            {
                AttributeName: tableSchema.partitionKeyField,
                AttributeType: jsTypeToDynamoKeyType(tableSchema.partitionKeyType)
            }
        ],
        KeySchema: [
            {
                AttributeName: tableSchema.partitionKeyField,
                KeyType: "HASH"
            }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: readCapacity,
            WriteCapacityUnits: writeCapacity
        },
        TableName: tableSchema.tableName,
    };

    if (tableSchema.sortKeyField) {
        request.AttributeDefinitions.push({
            AttributeName: tableSchema.sortKeyField,
            AttributeType: jsTypeToDynamoKeyType(tableSchema.sortKeyType)
        });
        request.KeySchema.push({
            AttributeName: tableSchema.sortKeyField,
            KeyType: "RANGE"
        });
    }

    return request;
}

/**
 * Build a request object that can be passed into `updateTimeToLive`.
 * Time to live settings will be enabled if `tableSchema.ttlField`
 * is defined and disabled otherwise.
 * @param {TableSchema} tableSchema
 * @returns input for the `updateTimeToLive` method
 */
export function buildUpdateTimeToLiveInput(tableSchema: TableSchema): aws.DynamoDB.UpdateTimeToLiveInput {
    checkSchema(tableSchema);

    if (tableSchema.ttlField) {
        return {
            TableName: tableSchema.tableName,
            TimeToLiveSpecification: {
                Enabled: true,
                AttributeName: tableSchema.ttlField
            }
        };
    } else {
        return {
            TableName: tableSchema.tableName,
            TimeToLiveSpecification: {
                Enabled: false,
                AttributeName: ""
            }
        };
    }
}

/**
 * Add a projection expression to an input object.  A projection expression
 * defines what attributes are returned in the result.  This can save
 * on bandwidth.
 *
 * For documentation on attribute names see: http://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.Attributes.html
 * @param tableSchema
 * @param projectableRequest the input to add a projection expression to
 * @param attributes an array of attribute names to fetch
 * @returns a copy of projectableRequest with the projection expression set
 */
export function addProjection<T extends { ProjectionExpression?: aws.DynamoDB.ProjectionExpression, ExpressionAttributeNames?: aws.DynamoDB.ExpressionAttributeNameMap }>(tableSchema: TableSchema, projectableRequest: T, attributes: string[]): T {
    checkSchema(tableSchema);

    const projection: string[] = projectableRequest.ProjectionExpression ? projectableRequest.ProjectionExpression.split(",").map(p => p.trim()) : [];
    const nameMap: aws.DynamoDB.ExpressionAttributeNameMap = {...projectableRequest.ExpressionAttributeNames};

    for (const attribute of attributes) {
        const existingName = Object.keys(nameMap).filter(name => nameMap[name] === attribute)[0];
        if (existingName) {
            if (projection.indexOf(existingName) === -1) {
                projection.push(existingName);
            }
        } else {
            let name = "#" + attribute.toUpperCase();
            while (projection.indexOf(name) !== -1) {
                name += "A";
            }
            projection.push(name);
            nameMap[name] = attribute;
        }
    }

    const res: T = {
        ...(projectableRequest as any)
    };
    if (projection.length) {
        res.ProjectionExpression = projection.join(",");
    }
    if (Object.keys(nameMap).length) {
        res.ExpressionAttributeNames = nameMap;
    }
    return res;
}

/**
 * Adds a condition expression to a input object.  A condition expression
 * defines under what conditions the item can be put/deleted.
 *
 * Any existing condition expression will be amended.
 *
 * @param tableSchema
 * @param conditionableRequest the input to add a condition expression to
 * @param conditions one or more conditions to turn into a condition expression
 * @returns a copy of conditionableRequest with the condition expression set
 */
export function addCondition<T extends { ConditionExpression?: aws.DynamoDB.ConditionExpression, ExpressionAttributeNames?: aws.DynamoDB.ExpressionAttributeNameMap, ExpressionAttributeValues?: aws.DynamoDB.ExpressionAttributeValueMap }>(tableSchema: TableSchema, conditionableRequest: T, ...conditions: Condition[]): T {
    return addExpression("ConditionExpression", tableSchema, conditionableRequest, ...conditions);
}

/**
 * Adds a filter expression to a input object.  A filter expression
 * refines results returned from a scan or query.  The filter applies
 * after the search and you will be billed for the bandwidth of all results
 * before the filter is applied.
 *
 * Any existing filter expression will be amended.
 *
 * @param tableSchema
 * @param filterableRequest the input to add a filter expression to
 * @param filters one or more filters to turn into a filter expression
 * @returns a copy of filterableRequest with the condition expression set
 */
export function addFilter<T extends { FilterExpression?: aws.DynamoDB.ConditionExpression, ExpressionAttributeNames?: aws.DynamoDB.ExpressionAttributeNameMap, ExpressionAttributeValues?: aws.DynamoDB.ExpressionAttributeValueMap }>(tableSchema: TableSchema, filterableRequest: T, ...filters: Condition[]): T {
    return addExpression("FilterExpression", tableSchema, filterableRequest, ...filters);
}

function addExpression<T extends { ExpressionAttributeNames?: aws.DynamoDB.ExpressionAttributeNameMap, ExpressionAttributeValues?: aws.DynamoDB.ExpressionAttributeValueMap }, K extends keyof T>(expressionKey: string, tableSchema: TableSchema, conditionableRequest: T, ...conditions: Condition[]): T {
    checkSchema(tableSchema);
    checkConditions(conditions, "default");
    let exp: aws.DynamoDB.ConditionExpression = conditionableRequest[expressionKey] || undefined;
    const nameMap: aws.DynamoDB.ExpressionAttributeNameMap = {...(conditionableRequest.ExpressionAttributeNames || {})};
    const valueMap: aws.DynamoDB.ExpressionAttributeValueMap = {...(conditionableRequest.ExpressionAttributeValues || {})};

    for (const condition of conditions) {
        const attributeName = getExpressionAttributeName(nameMap, condition.attribute);
        const valueNames = getExpressionValueNames(tableSchema, valueMap, condition.values);

        if (exp) {
            exp += " AND ";
        } else {
            exp = "";
        }
        if (condition.operator === "BETWEEN") {
            // This isn't worth generalizing because it's not like other operators.
            exp += `${attributeName} BETWEEN ${valueNames[0]} AND ${valueNames[1]}`;
        } else if (condition.operator === "IN") {
            exp += `${attributeName} IN (${valueNames.join(", ")})`;
        } else if (operatorIsFunction(condition.operator)) {
            exp += `${condition.operator}(${[attributeName, ...valueNames].join(", ")})`;
        } else {
            exp += `${attributeName} ${condition.operator} ${valueNames[0]}`;
        }
    }

    const res: T = {
        ...(conditionableRequest as any)
    };
    if (exp) {
        res[expressionKey] = exp;
    }
    if (Object.keys(nameMap).length) {
        res.ExpressionAttributeNames = nameMap;
    }
    if (Object.keys(valueMap).length) {
        res.ExpressionAttributeValues = valueMap;
    }
    return res;
}

/**
 * Get the serialized request key object for the partition and sort key.
 */
function getKey(tableSchema: TableSchema, partitionKeyValue: DynamoKey, sortKeyValue?: DynamoKey): aws.DynamoDB.Key {
    const key: aws.DynamoDB.Key = {
        [tableSchema.partitionKeyField]: buildRequestPutItem(tableSchema, partitionKeyValue)
    };
    if (sortKeyValue != null) {
        key[tableSchema.sortKeyField] = buildRequestPutItem(tableSchema, sortKeyValue);
    }
    return key;
}

/**
 * Get a name that is not currently used in the given ExpressionAttributeValueMap
 * and add it.
 */
function getExpressionValueName(tableSchema: TableSchema, valueMap: aws.DynamoDB.ExpressionAttributeValueMap, value: any): string {
    let name: string;
    for (let i = 0; valueMap[name = `:${indexToAlias(i, false)}`]; i++) {
    }
    valueMap[name] = buildRequestPutItem(tableSchema, value);
    return name;
}

/**
 * Get names for values that are not currently used in the ExpressionAttributeValueMap
 * and add them.
 */
function getExpressionValueNames(tableSchema: TableSchema, valueMap: aws.DynamoDB.ExpressionAttributeValueMap, values: any[] = []): string[] {
    const valueNames: string[] = [];
    for (let i = 0; i < values.length; i++) {
        valueNames[i] = getExpressionValueName(tableSchema, valueMap, values[i]);
    }
    return valueNames;
}

/**
 * Get the attribute name that can be used in expressions.  If it is a reserved word
 * or has a literal `.` (as indicated by a backslash)
 *
 * If a new name is required it is added to attributeMap as a side effect.
 */
function getExpressionAttributeName(attributeMap: aws.DynamoDB.ExpressionAttributeNameMap, attribute: string): string {
    const attributeParts = attribute.split(/\./);

    // 'a\\.b' was split into ['a\\', 'b'] and needs to be joined into 'a.b'
    for (let i = 0; i < attributeParts.length - 1; i++) {
        if (attributeParts[i].endsWith("\\")) {
            attributeParts.splice(i, 2, attributeParts[i].substring(0, attributeParts[i].length - 1) + "." + attributeParts[i + 1]);
            i--;
        }
    }

    return attributeParts
        .map(attributePart => {
            if (/^[a-zA-Z][^\s#:.]*$/.test(attributePart) && dynamoDbReservedWords.indexOf(attributePart) === -1) {
                // This name is clean for use as is.
                return attributePart;
            }

            const existingName = Object.keys(attributeMap).find(existingKey => attributeMap[existingKey] === attributePart);
            if (existingName) {
                return existingName;
            }

            let newName: string = null;
            for (let i = 0; attributeMap[newName = `#${indexToAlias(i, true)}`]; i++) {
            }
            attributeMap[newName] = attributePart;
            return newName;

        })
        .join(".");
}

/**
 * Turn an index number into an alias for a value or attribute.
 * @param ix
 * @param caps whether to use capital letters
 */
function indexToAlias(ix: number, caps: boolean): string {
    const asciiOffset = caps ? 65 : 97;
    if (ix < 26) {
        return String.fromCharCode(ix + asciiOffset);
    } else if (ix < 65536) {
        return String.fromCharCode(ix / 26 - 1 + asciiOffset) + String.fromCharCode(ix % 26 + asciiOffset);
    } else {
        throw new Error("Seriously?");
    }
}

function jsTypeToDynamoKeyType(t: "string" | "number"): "S" | "N" {
    switch (t) {
        case "string":
            return "S";
        case "number":
            return "N";
    }
    throw new Error("Unhandled key type.");
}
