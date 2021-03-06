import * as chai from "chai";
import {
    addCondition,
    addFilter,
    addProjection,
    buildCreateTableInput,
    buildDeleteInput,
    buildDeleteTableInput,
    buildDescribeTableInput,
    buildDescribeTimeToLiveInput,
    buildGetInput,
    buildPutInput,
    buildQueryInput,
    buildRequestPutItem,
    buildScanInput,
    buildTransactWriteItemsInput,
    buildUpdateInputFromActions
} from "./requestBuilder";
import {TableSchema} from "./TableSchema";

describe("requestBuilder", () => {
    describe("buildRequestPutItem", () => {
        const defaultTableSchema: TableSchema = {
            tableName: "table",
            partitionKeyField: "primary",
            partitionKeyType: "string"
        };

        it("serializes an empty string", () => {
            const serialized = buildRequestPutItem(defaultTableSchema, "");
            chai.assert.deepEqual(serialized, {S: ""});
        });

        it("serializes a non-empty string", () => {
            const serialized = buildRequestPutItem(defaultTableSchema, "Hey man nice marmot.");
            chai.assert.deepEqual(serialized, {S: "Hey man nice marmot."});
        });

        it("serializes a Buffer", () => {
            const serialized = buildRequestPutItem(defaultTableSchema, Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64]));
            chai.assert.deepEqual(serialized, {B: "SGVsbG8gV29ybGQ="});
        });

        it("serializes an empty Buffer", () => {
            const serialized = buildRequestPutItem(defaultTableSchema, Buffer.from([]));
            chai.assert.deepEqual(serialized, {B: ""});
        });

        it("serializes a Uint8Array", () => {
            const serialized = buildRequestPutItem(defaultTableSchema, new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64]));
            chai.assert.deepEqual(serialized, {B: "SGVsbG8gV29ybGQ="});
        });

        it("serializes an empty Uint8Array", () => {
            const serialized = buildRequestPutItem(defaultTableSchema, new Uint8Array([]));
            chai.assert.deepEqual(serialized, {B: ""});
        });

        it("serializes an array of numbers", () => {
            const serialized = buildRequestPutItem(defaultTableSchema, [2, 4]);
            chai.assert.deepEqual(serialized, {
                L: [
                    {N: "2"},
                    {N: "4"}
                ]
            });
        });

        it("serializes an array of strings", () => {
            const serialized = buildRequestPutItem(defaultTableSchema, ["Giraffe", "Hippo", "Zebra"]);
            chai.assert.deepEqual(serialized, {
                L: [
                    {S: "Giraffe"},
                    {S: "Hippo"},
                    {S: "Zebra"}
                ]
            });
        });

        it("serializes a Set of numbers", () => {
            const serialized = buildRequestPutItem(defaultTableSchema, new Set([
                2,
                4
            ]));
            chai.assert.deepEqual(serialized, {
                NS: ["2", "4"]
            });
        });

        it("serializes a Set of strings", () => {
            const serialized = buildRequestPutItem(defaultTableSchema, new Set(["Giraffe", "Hippo", "Zebra"]));
            chai.assert.deepEqual(serialized, {
                SS: ["Giraffe", "Hippo", "Zebra"]
            });
        });

        it("serializes a Set of Buffers", () => {
            const serialized = buildRequestPutItem(defaultTableSchema, new Set([
                Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64]),
                Buffer.from([0x4a, 0x65, 0x66, 0x66, 0x47, 0x20, 0x77, 0x61, 0x73, 0x20, 0x68, 0x65, 0x72, 0x65]),
                Buffer.from([0x6b, 0x77, 0x79, 0x6a, 0x69, 0x62, 0x6f])
            ]));
            chai.assert.deepEqual(serialized, {
                BS: [
                    "SGVsbG8gV29ybGQ=",
                    "SmVmZkcgd2FzIGhlcmU=",
                    "a3d5amlibw=="
                ]
            });
        });

        it("serializes a Set of Uint8Arrays", () => {
            const serialized = buildRequestPutItem(defaultTableSchema, new Set([
                new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64]),
                new Uint8Array([0x4a, 0x65, 0x66, 0x66, 0x47, 0x20, 0x77, 0x61, 0x73, 0x20, 0x68, 0x65, 0x72, 0x65]),
                new Uint8Array([0x6b, 0x77, 0x79, 0x6a, 0x69, 0x62, 0x6f])
            ]));
            chai.assert.deepEqual(serialized, {
                BS: [
                    "SGVsbG8gV29ybGQ=",
                    "SmVmZkcgd2FzIGhlcmU=",
                    "a3d5amlibw=="
                ]
            });
        });

        it("marshals dates to ISO8601 strings by default", () => {
            const serialized = buildRequestPutItem(defaultTableSchema, new Date("1982-09-10"));
            chai.assert.deepEqual(serialized, {S: "1982-09-10T00:00:00.000Z"});
        });

        it("uses the set dateSerializationFunction", () => {
            const serialized = buildRequestPutItem({
                ...defaultTableSchema,
                dateSerializationFunction: d => d.getTime()
            }, new Date("1982-09-10"));
            chai.assert.deepEqual(serialized, {N: "400464000000"});
        });
    });

    describe("buildGetInput", () => {
        it("builds input for a table with a hash key", () => {
            const input = buildGetInput({
                tableName: "table",
                partitionKeyField: "primary",
                partitionKeyType: "string",
            }, "prim");

            chai.assert.deepEqual(input, {
                TableName: "table",
                Key: {
                    primary: {S: "prim"}
                }
            });
        });

        it("builds input for a table with a hash and sort key", () => {
            const input = buildGetInput({
                tableName: "table",
                partitionKeyField: "primary",
                partitionKeyType: "string",
                sortKeyField: "sort",
                sortKeyType: "string"
            }, "prim", "so");

            chai.assert.deepEqual(input, {
                TableName: "table",
                Key: {
                    primary: {S: "prim"},
                    sort: {S: "so"}
                }
            });
        });

        it("builds input when the sort key value is 0", () => {
            const input = buildGetInput({
                tableName: "table",
                partitionKeyField: "primary",
                partitionKeyType: "string",
                sortKeyField: "sort",
                sortKeyType: "number"
            }, "prim", 0);

            chai.assert.deepEqual(input, {
                TableName: "table",
                Key: {
                    primary: {S: "prim"},
                    sort: {N: "0"}
                }
            });
        });

        it("throws an error when given a secondary schema", () => {
            chai.assert.throws(() => {
                buildGetInput({
                    tableName: "table",
                    indexName: "secondaryIndex",
                    partitionKeyField: "secondary",
                    partitionKeyType: "string"
                }, "prim");
            });
        });
    });

    describe("buildPutInput", () => {
        it("serializes Date TTLs", () => {
            const serialized = buildPutInput({
                tableName: "table",
                partitionKeyField: "primary",
                partitionKeyType: "string",
                ttlField: "ttl"
            }, {
                primary: "xxx",
                ttl: new Date('2017-08-18T21:11:29.275Z')
            });
            chai.assert.deepEqual(serialized, {
                TableName: "table",
                Item: {
                    primary: {
                        S: "xxx"
                    },
                    ttl: {
                        N: "1503090689"
                    }
                }
            });
        });
    });

    describe("buildUpdateInputFromActions", () => {
        const tableSchema: TableSchema = {
            tableName: "ProductCatalog",
            partitionKeyField: "Id",
            partitionKeyType: "number"
        };

        const item = {
            Id: 789,
            ProductCategory: "Home Improvement",
            Price: 52,
            InStock: true,
            Brand: "Acme"
        };

        it("puts strings and numbers", () => {
            const input = buildUpdateInputFromActions(tableSchema, item,
                {action: "put", attribute: "ProductCategory", value: "Hardware"},
                {action: "put", attribute: "Price", value: 60}
            );
            chai.assert.deepEqual(input, {
                TableName: "ProductCatalog",
                Key: {
                    Id: {
                        N: "789"
                    }
                },
                UpdateExpression: "SET ProductCategory = :a, Price = :b",
                ExpressionAttributeValues: {
                    ":a": {"S": "Hardware"},
                    ":b": {"N": "60"}
                }
            });
        });

        it("puts lists and maps", () => {
            const input = buildUpdateInputFromActions(tableSchema, item,
                {action: "put", attribute: "RelatedItems", value: ["Hammer"]},
                {action: "put", attribute: "ProductReviews", value: {"5Star": ["Best product ever!"]}}
            );
            chai.assert.deepEqual(input, {
                TableName: "ProductCatalog",
                Key: {
                    Id: {
                        N: "789"
                    }
                },
                UpdateExpression: "SET RelatedItems = :a, ProductReviews = :b",
                ExpressionAttributeValues: {
                    ":a": {
                        "L": [
                            {"S": "Hammer"}
                        ]
                    },
                    ":b": {
                        "M": {
                            "5Star": {
                                "L": [
                                    {"S": "Best product ever!"}
                                ]
                            }
                        }
                    }
                }
            });
        });

        it("sets at a list index", () => {
            const input = buildUpdateInputFromActions(tableSchema, item,
                {action: "list_set_at_index", attribute: "RelatedItems", value: "Nails", index: 1}
            );
            chai.assert.deepEqual(input, {
                TableName: "ProductCatalog",
                Key: {
                    Id: {
                        N: "789"
                    }
                },
                UpdateExpression: "SET RelatedItems[1] = :a",
                ExpressionAttributeValues: {
                    ":a": {
                        "S": "Nails"
                    }
                }
            });
        });

        it("adds nested map attributes", () => {
            const input = buildUpdateInputFromActions(tableSchema, item,
                {
                    action: "list_set_at_index",
                    attribute: "ProductReviews.5Star",
                    value: "Very happy with my purchase",
                    index: 1
                },
                {action: "put", attribute: "ProductReviews.3Star", value: ["Just OK - not that great"]}
            );
            chai.assert.deepEqual(input, {
                TableName: "ProductCatalog",
                Key: {
                    Id: {
                        N: "789"
                    }
                },
                UpdateExpression: "SET ProductReviews.#A[1] = :a, ProductReviews.#B = :b",
                ExpressionAttributeNames: {
                    "#A": "5Star",
                    "#B": "3Star"
                },
                ExpressionAttributeValues: {
                    ":a": {"S": "Very happy with my purchase"},
                    ":b": {
                        "L": [
                            {"S": "Just OK - not that great"}
                        ]
                    }
                }
            });
        });

        it("adds numbers", () => {
            const input = buildUpdateInputFromActions(tableSchema, item,
                {action: "number_add", attribute: "Price", value: 5}
            );
            chai.assert.deepEqual(input, {
                TableName: "ProductCatalog",
                Key: {
                    Id: {
                        N: "789"
                    }
                },
                UpdateExpression: "SET Price = Price + :a",
                ExpressionAttributeValues: {
                    ":a": {"N": "5"},
                }
            });
        });

        it("subtracts numbers", () => {
            const input = buildUpdateInputFromActions(tableSchema, item,
                {action: "number_subtract", attribute: "Price", value: 15}
            );
            chai.assert.deepEqual(input, {
                TableName: "ProductCatalog",
                Key: {
                    Id: {
                        N: "789"
                    }
                },
                UpdateExpression: "SET Price = Price - :a",
                ExpressionAttributeValues: {
                    ":a": {"N": "15"},
                }
            });
        });

        it("appends to a list", () => {
            const input = buildUpdateInputFromActions(tableSchema, item,
                {action: "list_append", attribute: "RelatedItems", values: ["Screwdriver", "Hacksaw"]}
            );
            chai.assert.deepEqual(input, {
                TableName: "ProductCatalog",
                Key: {
                    Id: {
                        N: "789"
                    }
                },
                UpdateExpression: "SET RelatedItems = list_append(RelatedItems, :a)",
                ExpressionAttributeValues: {
                    ":a": {
                        "L": [
                            {"S": "Screwdriver"},
                            {"S": "Hacksaw"}
                        ]
                    }
                }
            });
        });

        it("prepends to a list", () => {
            const input = buildUpdateInputFromActions(tableSchema, item,
                {action: "list_prepend", attribute: "RelatedItems", values: ["Chisel"]}
            );
            chai.assert.deepEqual(input, {
                TableName: "ProductCatalog",
                Key: {
                    Id: {
                        N: "789"
                    }
                },
                UpdateExpression: "SET RelatedItems = list_append(:a, RelatedItems)",
                ExpressionAttributeValues: {
                    ":a": {
                        "L": [
                            {"S": "Chisel"}
                        ]
                    }
                }
            });
        });

        it("sets if not exists", () => {
            const input = buildUpdateInputFromActions(tableSchema, item,
                {action: "put_if_not_exists", attribute: "Price", value: 100}
            );
            chai.assert.deepEqual(input, {
                TableName: "ProductCatalog",
                Key: {
                    Id: {
                        N: "789"
                    }
                },
                UpdateExpression: "SET Price = if_not_exists(Price, :a)",
                ExpressionAttributeValues: {
                    ":a": {
                        "N": "100"
                    }
                }
            });
        });

        it("removes an attribute from an item", () => {
            const input = buildUpdateInputFromActions(tableSchema, item,
                {action: "remove", attribute: "Brand"},
                {action: "remove", attribute: "InStock"},
                {action: "remove", attribute: "QuantityOnHand"}
            );
            chai.assert.deepEqual(input, {
                TableName: "ProductCatalog",
                Key: {
                    Id: {
                        N: "789"
                    }
                },
                UpdateExpression: "REMOVE Brand, InStock, QuantityOnHand"
            });
        });

        it("removes an element from a list", () => {
            const input = buildUpdateInputFromActions(tableSchema, item,
                {action: "list_remove_at_index", attribute: "RelatedItems", index: 1},
                {action: "list_remove_at_index", attribute: "RelatedItems", index: 2}
            );
            chai.assert.deepEqual(input, {
                TableName: "ProductCatalog",
                Key: {
                    Id: {
                        N: "789"
                    }
                },
                UpdateExpression: "REMOVE RelatedItems[1], RelatedItems[2]"
            });
        });

        it("adds an element to a Set", () => {
            const input = buildUpdateInputFromActions(tableSchema, item,
                {action: "set_add", attribute: "Color", values: new Set(["Orange", "Purple"])},
            );
            chai.assert.deepEqual(input, {
                TableName: "ProductCatalog",
                Key: {
                    Id: {
                        N: "789"
                    }
                },
                UpdateExpression: "ADD Color :a",
                ExpressionAttributeValues: {
                    ":a": {
                        "SS": ["Orange", "Purple"]
                    }
                }
            });
        });

        it("removes elements from a Set", () => {
            const input = buildUpdateInputFromActions(tableSchema, item,
                {action: "set_delete", attribute: "Color", values: new Set(["Yellow", "Purple"])},
            );
            chai.assert.deepEqual(input, {
                TableName: "ProductCatalog",
                Key: {
                    Id: {
                        N: "789"
                    }
                },
                UpdateExpression: "DELETE Color :a",
                ExpressionAttributeValues: {
                    ":a": {
                        "SS": ["Yellow", "Purple"]
                    }
                }
            });
        });

        it("requires at least one action", () => {
            chai.assert.throws(() => {
                buildUpdateInputFromActions(tableSchema, item);
            });
        });

        it("combines multiple actions", () => {
            const input = buildUpdateInputFromActions(tableSchema, item,
                {action: "put", attribute: "ProductCategory", value: "Hardware"},
                {action: "put", attribute: "Price", value: 60},
                {action: "remove", attribute: "Brand"},
                {action: "remove", attribute: "InStock"},
                {action: "remove", attribute: "QuantityOnHand"}
            );
            chai.assert.deepEqual(input, {
                TableName: "ProductCatalog",
                Key: {
                    Id: {
                        N: "789"
                    }
                },
                UpdateExpression: "SET ProductCategory = :a, Price = :b REMOVE Brand, InStock, QuantityOnHand",
                ExpressionAttributeValues: {
                    ":a": {"S": "Hardware"},
                    ":b": {"N": "60"}
                }
            });
        });

        it("will version updates", () => {
            const input = buildUpdateInputFromActions(
                {
                    ...tableSchema,
                    versionKeyField: "version"
                },
                {
                    ...item,
                    version: 3
                },
                {action: "put", attribute: "ProductCategory", value: "Hardware"},
                {action: "put", attribute: "Price", value: 60}
            );
            chai.assert.deepEqual(input, {
                TableName: "ProductCatalog",
                Key: {
                    Id: {
                        N: "789"
                    }
                },
                ConditionExpression: "version = :a",
                UpdateExpression: "SET ProductCategory = :b, Price = :c, version = version + :d",
                ExpressionAttributeValues: {
                    ":a": {"N": "3"},
                    ":b": {"S": "Hardware"},
                    ":c": {"N": "60"},
                    ":d": {"N": "1"},
                }
            });
        });
    });

    describe("buildDeleteInput", () => {
        it("builds input for a table with a hash key", () => {
            const input = buildDeleteInput(
                {
                    tableName: "table",
                    partitionKeyField: "primary",
                    partitionKeyType: "string"
                },
                {
                    primary: "prim"
                }
            );

            chai.assert.deepEqual(input, {
                TableName: "table",
                Key: {
                    primary: {S: "prim"}
                }
            });
        });

        it("builds input for a table with a hash and sort key", () => {
            const input = buildDeleteInput(
                {
                    tableName: "table",
                    partitionKeyField: "primary",
                    partitionKeyType: "string",
                    sortKeyField: "sort",
                    sortKeyType: "string"
                },
                {
                    primary: "prim",
                    sort: "so"
                }
            );

            chai.assert.deepEqual(input, {
                TableName: "table",
                Key: {
                    primary: {S: "prim"},
                    sort: {S: "so"}
                }
            });
        });

        it("builds input when the sort key value is 0", () => {
            const input = buildDeleteInput(
                {
                    tableName: "table",
                    partitionKeyField: "primary",
                    partitionKeyType: "string",
                    sortKeyField: "sort",
                    sortKeyType: "number"
                },
                {
                    primary: "prim",
                    sort: 0
                }
            );

            chai.assert.deepEqual(input, {
                TableName: "table",
                Key: {
                    primary: {S: "prim"},
                    sort: {N: "0"}
                }
            });
        });

        it("builds input for a versioned delete", () => {
            const input = buildDeleteInput(
                {
                    tableName: "table",
                    partitionKeyField: "primary",
                    partitionKeyType: "string",
                    versionKeyField: "version"
                },
                {
                    primary: "prim",
                    version: 6
                }
            );

            chai.assert.deepEqual(input, {
                TableName: "table",
                Key: {
                    primary: {S: "prim"}
                },
                ConditionExpression: "version = :a",
                ExpressionAttributeValues: {
                    ":a": {N: "6"}
                }
            });
        });
    });

    describe("buildQueryInput", () => {
        const stringSortTableSchema: TableSchema = {
            tableName: "table",
            partitionKeyField: "primary",
            partitionKeyType: "string",
            sortKeyField: "sort",
            sortKeyType: "string"
        };

        const numberSortTableSchema: TableSchema = {
            tableName: "table",
            partitionKeyField: "primary",
            partitionKeyType: "string",
            sortKeyField: "sort",
            sortKeyType: "number"
        };

        it("serializes a basic query without sort key and without sort operator", () => {
            const input = buildQueryInput({
                tableName: "table",
                partitionKeyField: "primary",
                partitionKeyType: "string"
            }, "mah value");
            chai.assert.deepEqual(input, {
                TableName: "table",
                ExpressionAttributeNames: {
                    "#P": "primary"
                },
                ExpressionAttributeValues: {
                    ":p": {
                        "S": "mah value"
                    }
                },
                KeyConditionExpression: "#P = :p"
            });
        });

        it("serializes a basic query without sort operator", () => {
            const input = buildQueryInput(stringSortTableSchema, "mah value");
            chai.assert.deepEqual(input, {
                TableName: "table",
                ExpressionAttributeNames: {
                    "#P": "primary"
                },
                ExpressionAttributeValues: {
                    ":p": {
                        "S": "mah value"
                    }
                },
                KeyConditionExpression: "#P = :p"
            });
        });

        it("throws an error without sort key but with sort operator", () => {
            chai.assert.throws(() => {
                buildQueryInput({
                    tableName: "table",
                    partitionKeyField: "primary",
                    partitionKeyType: "string"
                }, "mah value", "begins_with", "foo");
            });
        });

        it("serializes a BETWEEN query", () => {
            const input = buildQueryInput(numberSortTableSchema, "mah value", "BETWEEN", 1, 10);
            chai.assert.deepEqual(input, {
                TableName: "table",
                ExpressionAttributeNames: {
                    "#P": "primary",
                    "#S": "sort",
                },
                ExpressionAttributeValues: {
                    ":p": {
                        "S": "mah value"
                    },
                    ":a": {
                        "N": "1"
                    },
                    ":b": {
                        "N": "10"
                    }
                },
                KeyConditionExpression: "#P = :p AND #S BETWEEN :a AND :b"
            });
        });

        it("serializes a begins_with query", () => {
            const input = buildQueryInput(stringSortTableSchema, "mah value", "begins_with", "a");
            chai.assert.deepEqual(input, {
                TableName: "table",
                ExpressionAttributeNames: {
                    "#P": "primary",
                    "#S": "sort",
                },
                ExpressionAttributeValues: {
                    ":p": {
                        "S": "mah value"
                    },
                    ":a": {
                        "S": "a"
                    }
                },
                KeyConditionExpression: "#P = :p AND begins_with(#S, :a)"
            });
        });

        it("serializes a <= query", () => {
            const input = buildQueryInput(numberSortTableSchema, "mah value", "<=", 92);
            chai.assert.deepEqual(input, {
                TableName: "table",
                ExpressionAttributeNames: {
                    "#P": "primary",
                    "#S": "sort",
                },
                ExpressionAttributeValues: {
                    ":p": {
                        "S": "mah value"
                    },
                    ":a": {
                        "N": "92"
                    }
                },
                KeyConditionExpression: "#P = :p AND #S <= :a"
            });
        });

        it("supports global secondary indexes", () => {
            const input = buildQueryInput({...stringSortTableSchema, indexName: "globalIndex"}, "ell seven");
            chai.assert.deepEqual(input, {
                TableName: "table",
                IndexName: "globalIndex",
                ExpressionAttributeNames: {
                    "#P": "primary"
                },
                ExpressionAttributeValues: {
                    ":p": {
                        "S": "ell seven"
                    }
                },
                KeyConditionExpression: "#P = :p"
            });
        });
    });

    describe("buildScanInput", () => {
        const defaultTableSchema: TableSchema = {
            tableName: "table",
            partitionKeyField: "primary",
            partitionKeyType: "string"
        };

        it("creates a basic scan input", () => {
            const input = buildScanInput(defaultTableSchema);

            chai.assert.deepEqual(input, {
                TableName: "table"
            });
        });

        it("supports global secondary indexes", () => {
            const input = buildScanInput({...defaultTableSchema, indexName: "globalIndex"});

            chai.assert.deepEqual(input, {
                TableName: "table",
                IndexName: "globalIndex"
            });
        });

        it("applies filters", () => {
            const input = buildScanInput(defaultTableSchema, {
                attribute: "nonprimary",
                operator: "=",
                values: [11]
            });

            chai.assert.deepEqual(input, {
                TableName: "table",
                ExpressionAttributeValues: {
                    ":a": {
                        N: "11"
                    }
                },
                FilterExpression: "nonprimary = :a"
            });
        });
    });

    describe("buildTransactWriteItemsInput", () => {
        it("builds transact write items input from put, delete and update", () => {
            const defaultTableSchema: TableSchema = {
                tableName: "table",
                partitionKeyField: "primary",
                partitionKeyType: "string"
            };

            const putItem = buildPutInput(defaultTableSchema, {
                primary: "foo",
                other: "bar"
            });
            const deleteItem = buildDeleteInput(defaultTableSchema, {primary: "baz"});
            const updateItem = buildUpdateInputFromActions(
                defaultTableSchema,
                {
                    primary: "qux"
                },
                {
                    action: "put",
                    attribute: "zing",
                    value: 123
                }
            );

            const input = buildTransactWriteItemsInput(putItem, deleteItem, updateItem);
            chai.assert.deepEqual(input, {
                TransactItems: [
                    {
                        Put: {
                            TableName: "table",
                            Item: {
                                primary: {S: "foo"},
                                other: {S: "bar"}
                            }
                        }
                    },
                    {
                        Delete: {
                            TableName: "table",
                            Key: {
                                primary: {S: "baz"}
                            }
                        }
                    },
                    {
                        Update: {
                            TableName: "table",
                            Key: {
                                primary: {S: "qux"}
                            },
                            UpdateExpression: "SET zing = :a",
                            ExpressionAttributeValues: {
                                ":a": {N: "123"}
                            }
                        }
                    }
                ]
            })
        });
    });

    describe("buildCreateTableInput", () => {
        it("builds a create table input", () => {
            const req = buildCreateTableInput({
                tableName: "table",
                partitionKeyField: "primary",
                partitionKeyType: "string"
            });

            chai.assert.deepEqual(req, {
                TableName: "table",
                AttributeDefinitions: [
                    {
                        AttributeName: "primary",
                        AttributeType: "S"
                    }
                ],
                KeySchema: [
                    {
                        AttributeName: "primary",
                        KeyType: "HASH"
                    }
                ],
                ProvisionedThroughput: {
                    ReadCapacityUnits: 1,
                    WriteCapacityUnits: 1
                }
            });
        });

        it("can create a table with a primary index and secondary index", () => {
            const req = buildCreateTableInput([
                {
                    tableName: "table",
                    partitionKeyField: "primary",
                    partitionKeyType: "string"
                },
                {
                    tableName: "table",
                    indexName: "secondaryIndex",
                    indexProperties: {
                        type: "GLOBAL",
                        projectionType: "KEYS_ONLY"
                    },
                    partitionKeyField: "secondary",
                    partitionKeyType: "string",
                    sortKeyField: "secondarySort",
                    sortKeyType: "number"
                }
            ]);

            chai.assert.deepEqual(req, {
                TableName: "table",
                AttributeDefinitions: [
                    {
                        AttributeName: "primary",
                        AttributeType: "S"
                    },
                    {
                        AttributeName: "secondary",
                        AttributeType: "S"
                    },
                    {
                        AttributeName: "secondarySort",
                        AttributeType: "N"
                    }
                ],
                KeySchema: [
                    {
                        AttributeName: "primary",
                        KeyType: "HASH"
                    }
                ],
                GlobalSecondaryIndexes: [
                    {
                        IndexName: "secondaryIndex",
                        KeySchema: [
                            {
                                AttributeName: "secondary",
                                KeyType: "HASH"
                            },
                            {
                                AttributeName: "secondarySort",
                                KeyType: "RANGE"
                            }
                        ],
                        Projection: {
                            ProjectionType: "KEYS_ONLY"
                        },
                        ProvisionedThroughput: {
                            ReadCapacityUnits: 1,
                            WriteCapacityUnits: 1
                        }
                    }
                ],
                ProvisionedThroughput: {
                    ReadCapacityUnits: 1,
                    WriteCapacityUnits: 1
                }
            });
        });

        it("won't create a table when given no primary schema", () => {
            chai.assert.throws(() => {
                buildCreateTableInput({
                    tableName: "table",
                    indexName: "secondaryIndex",
                    partitionKeyField: "secondary",
                    partitionKeyType: "string"
                });
            });

            chai.assert.throws(() => {
                buildCreateTableInput([
                    {
                        tableName: "table",
                        indexName: "secondaryIndex",
                        partitionKeyField: "secondary",
                        partitionKeyType: "string"
                    }
                ]);
            });
        });

        it("won't create a table when given multiple primary schemas", () => {
            chai.assert.throws(() => {
                buildCreateTableInput([
                    {
                        tableName: "table",
                        partitionKeyField: "primary",
                        partitionKeyType: "string"
                    },
                    {
                        tableName: "table",
                        partitionKeyField: "primary2",
                        partitionKeyType: "string"
                    }
                ]);
            });
        });
    });

    describe("buildDeleteTableInput", () => {
        it("builds a delete table input", () => {
            const req = buildDeleteTableInput({
                tableName: "table",
                partitionKeyField: "primary",
                partitionKeyType: "string"
            });
            chai.assert.equal(req.TableName, "table");
        });

        it("won't delete a table for the schema of a secondary index", () => {
            chai.assert.throws(() => {
                buildDeleteTableInput({
                    tableName: "table",
                    indexName: "secondaryIndex",
                    partitionKeyField: "primary",
                    partitionKeyType: "string"
                });
            });
        });
    });

    describe("buildDescribeTableInput", () => {
        it("builds the describe table input", () => {
            const req = buildDescribeTableInput({
                tableName: "table",
                partitionKeyField: "primary",
                partitionKeyType: "string"
            });
            chai.assert.equal(req.TableName, "table");
        });
    });

    describe("buildDescribeTimeToLiveInput", () => {
        it("builds the describe time-to-live input", () => {
            const req = buildDescribeTimeToLiveInput({
                tableName: "table",
                partitionKeyField: "primary",
                partitionKeyType: "string"
            });
            chai.assert.equal(req.TableName, "table");
        });
    });

    describe("addProjection", () => {
        const defaultTableSchema: TableSchema = {
            tableName: "table",
            partitionKeyField: "primary",
            partitionKeyType: "string",
            sortKeyField: "sort",
            sortKeyType: "string"
        };

        it("adds a projection to get input", () => {
            const input = buildGetInput(defaultTableSchema, "prim", "so");
            addProjection(defaultTableSchema, input, ["key", "lock"]);

            chai.assert.deepEqual(input, {
                TableName: "table",
                Key: {
                    primary: {S: "prim"},
                    sort: {S: "so"}
                },
                ExpressionAttributeNames: {
                    "#KEY": "key",
                    "#LOCK": "lock"
                },
                ProjectionExpression: "#KEY,#LOCK"
            });
        });

        it("adds a projection to an already projected expression", () => {
            const input = buildGetInput(defaultTableSchema, "prim", "so");
            addProjection(defaultTableSchema, input, ["key", "lock"]);
            addProjection(defaultTableSchema, input, ["key", "value"]);

            chai.assert.deepEqual(input, {
                TableName: "table",
                Key: {
                    primary: {S: "prim"},
                    sort: {S: "so"}
                },
                ExpressionAttributeNames: {
                    "#KEY": "key",
                    "#LOCK": "lock",
                    "#VALUE": "value"
                },
                ProjectionExpression: "#KEY,#LOCK,#VALUE"
            });
        });

        it("adds a projection to query input without key values", () => {
            const input = buildQueryInput(defaultTableSchema, "mah value", "BETWEEN", "alpha", "beta");
            addProjection(defaultTableSchema, input, ["key", "lock"]);

            chai.assert.deepEqual(input, {
                TableName: "table",
                ExpressionAttributeNames: {
                    "#P": "primary",
                    "#S": "sort",
                    "#KEY": "key",
                    "#LOCK": "lock",
                },
                ExpressionAttributeValues: {
                    ":p": {
                        "S": "mah value"
                    },
                    ":a": {
                        "S": "alpha"
                    },
                    ":b": {
                        "S": "beta"
                    }
                },
                KeyConditionExpression: `#P = :p AND #S BETWEEN :a AND :b`,
                ProjectionExpression: "#KEY,#LOCK"
            });
        });

        it("adds a projection to query input that includes key values", () => {
            const input = buildQueryInput(defaultTableSchema, "mah value", "BETWEEN", "alpha", "beta");
            addProjection(defaultTableSchema, input, ["primary", "sort", "key", "lock"]);

            chai.assert.deepEqual(input, {
                TableName: "table",
                ExpressionAttributeNames: {
                    "#P": "primary",
                    "#S": "sort",
                    "#KEY": "key",
                    "#LOCK": "lock",
                },
                ExpressionAttributeValues: {
                    ":p": {
                        "S": "mah value"
                    },
                    ":a": {
                        "S": "alpha"
                    },
                    ":b": {
                        "S": "beta"
                    }
                },
                KeyConditionExpression: `#P = :p AND #S BETWEEN :a AND :b`,
                ProjectionExpression: "#P,#S,#KEY,#LOCK"
            });
        });
    });

    describe("addCondition", () => {
        const defaultTableSchema: TableSchema = {
            tableName: "table",
            partitionKeyField: "primary",
            partitionKeyType: "string"
        };

        it("adds a condition to put input", () => {
            const input = buildPutInput(defaultTableSchema, {primary: "foo"});
            addCondition(defaultTableSchema, input, {
                attribute: "attributetoset",
                operator: "attribute_not_exists"
            });

            chai.assert.deepEqual(input, {
                TableName: "table",
                Item: {
                    primary: {
                        S: "foo"
                    }
                },
                ConditionExpression: "attribute_not_exists(attributetoset)"
            });
        });

        it("adds a condition with a reserved word key to put input", () => {
            const input = buildPutInput(defaultTableSchema, {primary: "foo"});
            addCondition(defaultTableSchema, input, {
                attribute: "primary",
                operator: "attribute_not_exists"
            });

            chai.assert.deepEqual(input, {
                TableName: "table",
                Item: {
                    primary: {
                        S: "foo"
                    }
                },
                ExpressionAttributeNames: {"#A": "primary"},
                ConditionExpression: "attribute_not_exists(#A)"
            });
        });

        it("adds three conditions to put input", () => {
            const input = buildPutInput(defaultTableSchema, {primary: "hick", eyes: 2, teeth: 12, ears: 2});
            addCondition(
                defaultTableSchema,
                input,
                {attribute: "eyes", operator: "<", values: [3]},
                {attribute: "teeth", operator: ">", values: [4]},
                {attribute: "ears", operator: "=", values: [2]}
            );

            chai.assert.deepEqual(input, {
                TableName: "table",
                Item: {
                    primary: {
                        S: "hick"
                    },
                    eyes: {
                        N: "2"
                    },
                    teeth: {
                        N: "12"
                    },
                    ears: {
                        N: "2"
                    }
                },
                ConditionExpression: "eyes < :a AND teeth > :b AND ears = :c",
                ExpressionAttributeValues: {
                    ":a": {
                        N: "3"
                    },
                    ":b": {
                        N: "4"
                    },
                    ":c": {
                        N: "2"
                    }
                }
            });
        });

        it("adds three conditions to put input, one at a time", () => {
            const input = buildPutInput(defaultTableSchema, {primary: "hick", eyes: 2, teeth: 12, ears: 2});
            addCondition(
                defaultTableSchema,
                input,
                {attribute: "eyes", operator: "<", values: [3]}
            );
            addCondition(
                defaultTableSchema,
                input,
                {attribute: "teeth", operator: ">", values: [4]}
            );
            addCondition(
                defaultTableSchema,
                input,
                {attribute: "ears", operator: "=", values: [2]}
            );

            chai.assert.deepEqual(input, {
                TableName: "table",
                Item: {
                    primary: {
                        S: "hick"
                    },
                    eyes: {
                        N: "2"
                    },
                    teeth: {
                        N: "12"
                    },
                    ears: {
                        N: "2"
                    }
                },
                ConditionExpression: "eyes < :a AND teeth > :b AND ears = :c",
                ExpressionAttributeValues: {
                    ":a": {
                        N: "3"
                    },
                    ":b": {
                        N: "4"
                    },
                    ":c": {
                        N: "2"
                    }
                }
            });
        });

        it("adds a condition to put input with versioning", () => {
            const input = buildPutInput({...defaultTableSchema, versionKeyField: "version"}, {
                primary: "foo",
                alphabet: "αβγδε"
            });
            addCondition(defaultTableSchema, input, {
                attribute: "alphabet",
                operator: "begins_with",
                values: ["abc"]
            });

            chai.assert.deepEqual(input, {
                TableName: "table",
                Item: {
                    primary: {
                        S: "foo"
                    },
                    alphabet: {
                        S: "αβγδε"
                    },
                    version: {
                        N: "1"
                    }
                },
                ConditionExpression: "attribute_not_exists(version) AND begins_with(alphabet, :a)",
                ExpressionAttributeValues: {
                    ":a": {
                        S: "abc"
                    }
                }
            });
        });

        it("adds a condition to put input with reserved words", () => {
            const input = buildPutInput(defaultTableSchema, {primary: "foo"});
            addCondition(
                defaultTableSchema,
                input,
                {attribute: "ASCII", operator: "begins_with", values: ["abc"]},
                {attribute: "GOTO", operator: ">", values: [11]},
                {attribute: "a.b\\.c", operator: "<", values: [0]},
            );

            chai.assert.deepEqual(input, {
                TableName: "table",
                Item: {
                    primary: {
                        S: "foo"
                    }
                },
                ConditionExpression: "begins_with(#A, :a) AND #B > :b AND a.#C < :c",
                ExpressionAttributeNames: {
                    "#A": "ASCII",
                    "#B": "GOTO",
                    "#C": "b.c"
                },
                ExpressionAttributeValues: {
                    ":a": {
                        S: "abc"
                    },
                    ":b": {
                        N: "11"
                    },
                    ":c": {
                        N: "0"
                    }
                }
            });
        });

        it("adds a condition with not=true", () => {
            const input = buildPutInput(defaultTableSchema, {
                primary: "Canada",
                capital: "Ottawa",
                population: 37797496
            });
            addCondition(
                defaultTableSchema,
                input,
                {attribute: "primary", operator: "attribute_exists"}
            );
            addCondition(
                defaultTableSchema,
                input,
                {attribute: "population", not: true, operator: "BETWEEN", values: [20000000, 50000000]}
            );

            chai.assert.deepEqual(input, {
                TableName: "table",
                Item: {
                    primary: {
                        S: "Canada"
                    },
                    capital: {
                        S: "Ottawa"
                    },
                    population: {
                        N: "37797496"
                    }
                },
                ConditionExpression: "attribute_exists(#A) AND NOT population BETWEEN :a AND :b",
                ExpressionAttributeNames: {
                    "#A": "primary"
                },
                ExpressionAttributeValues: {
                    ":a": {
                        N: "20000000"
                    },
                    ":b": {
                        N: "50000000"
                    }
                }
            });
        });
    });

    describe("addFilter", () => {
        const defaultTableSchema: TableSchema = {
            tableName: "table",
            partitionKeyField: "primary",
            partitionKeyType: "string",
            sortKeyField: "sort",
            sortKeyType: "number"
        };

        it("adds a filter to query input", () => {
            const input = buildQueryInput(defaultTableSchema, "foo");
            addFilter(defaultTableSchema, input, {
                attribute: "nonprimary",
                operator: "=",
                values: [11]
            });

            chai.assert.deepEqual(input, {
                TableName: "table",
                ExpressionAttributeNames: {
                    "#P": "primary"
                },
                ExpressionAttributeValues: {
                    ":a": {
                        N: "11"
                    },
                    ":p": {
                        S: "foo"
                    }
                },
                KeyConditionExpression: "#P = :p",
                FilterExpression: "nonprimary = :a"
            });
        });

        it("adds three filters to query input", () => {
            const input = buildQueryInput(defaultTableSchema, "foo");
            addFilter(
                defaultTableSchema,
                input,
                {attribute: "eyes", operator: "<", values: [3]},
                {attribute: "teeth", operator: ">", values: [4]},
                {attribute: "ears", operator: "=", values: [2]}
            );

            chai.assert.deepEqual(input, {
                TableName: "table",
                ExpressionAttributeNames: {
                    "#P": "primary"
                },
                ExpressionAttributeValues: {
                    ":a": {
                        N: "3"
                    },
                    ":b": {
                        N: "4"
                    },
                    ":c": {
                        N: "2"
                    },
                    ":p": {
                        S: "foo"
                    }
                },
                KeyConditionExpression: "#P = :p",
                FilterExpression: "eyes < :a AND teeth > :b AND ears = :c"
            });
        });

        it("adds three filters to query input, one at a time", () => {
            const input = buildQueryInput(defaultTableSchema, "foo");
            addFilter(
                defaultTableSchema,
                input,
                {attribute: "eyes", operator: "<", values: [3]}
            );
            addFilter(
                defaultTableSchema,
                input,
                {attribute: "teeth", operator: ">", values: [4]}
            );
            addFilter(
                defaultTableSchema,
                input,
                {attribute: "ears", operator: "=", values: [2]}
            );

            chai.assert.deepEqual(input, {
                TableName: "table",
                ExpressionAttributeNames: {
                    "#P": "primary"
                },
                ExpressionAttributeValues: {
                    ":a": {
                        N: "3"
                    },
                    ":b": {
                        N: "4"
                    },
                    ":c": {
                        N: "2"
                    },
                    ":p": {
                        S: "foo"
                    }
                },
                KeyConditionExpression: "#P = :p",
                FilterExpression: "eyes < :a AND teeth > :b AND ears = :c"
            });
        });

        it("adds a filter to query input with reserved words", () => {
            const input = buildQueryInput(defaultTableSchema, "foo");
            addFilter(
                defaultTableSchema,
                input,
                {attribute: "ASCII", operator: "begins_with", values: ["abc"]},
                {attribute: "GOTO", operator: ">", values: [11]},
                {attribute: "a.b\\.c", operator: "<", values: [0]},
            );

            chai.assert.deepEqual(input, {
                TableName: "table",
                ExpressionAttributeNames: {
                    "#P": "primary",
                    "#A": "ASCII",
                    "#B": "GOTO",
                    "#C": "b.c"
                },
                ExpressionAttributeValues: {
                    ":a": {
                        S: "abc"
                    },
                    ":b": {
                        N: "11"
                    },
                    ":c": {
                        N: "0"
                    },
                    ":p": {
                        S: "foo"
                    }
                },
                KeyConditionExpression: "#P = :p",
                FilterExpression: "begins_with(#A, :a) AND #B > :b AND a.#C < :c"
            });
        });

        it("adds a filter with not=true", () => {
            const input = buildQueryInput(defaultTableSchema, "Canada");
            addFilter(
                defaultTableSchema,
                input,
                {attribute: "population", not: true, operator: "BETWEEN", values: [20000000, 50000000]}
            );

            chai.assert.deepEqual(input, {
                TableName: "table",
                ExpressionAttributeNames: {
                    "#P": "primary"
                },
                ExpressionAttributeValues: {
                    ":a": {
                        N: "20000000"
                    },
                    ":b": {
                        N: "50000000"
                    },
                    ":p": {
                        S: "Canada"
                    }
                },
                KeyConditionExpression: "#P = :p",
                FilterExpression: "NOT population BETWEEN :a AND :b",
            });
        });
    });
});
