# myorm

`myorm` is a strongly typed object-relationship model library for interacting with your MySQL database (hence the name, `MyORM').  

Much of the syntax in `myorm` is derived and influenced by Microsoft's C# Entity Framework Core libraries, so you'll see a lot of similarities. Most of this was possible with the use of JavaScript's `Proxy' class.  

In essence, `MyORM` provides an interface to a table in your database using `mysql2`. All queries are built using functions and property references to assist an easy way to retrieve records on the fly. Additionally, for performative reasons and for repetitive reasons, you can build your statement and save it for future use, similar to a native `View` in MySQL, but instead in your code.  

__NOTE: All examples used in this README are in TypeScript, but this does work just fine with JSDOC typing. Additionally, all examples are derived from the `Chinook Database Schema`, you can see all TypeScript defined interfaces in /lib/src/examples/chinook-types.ts__

# Table of Contents
  - [Chinook Database Schema](#chinook-database-schema)
  - [Creating Table Contexts](#creating-table-contexts)
    - [Typing](#preparing-types-for-mysqltablecontext)
    - [Constructor Syntax](#syntax-of-mysqltablecontext)
    - [Examples](#constructing-mysqltablecontext-examples)
  - [Querying](#querying)
  - [Inserting](#inserting)
  - [Updating](#updating)
  - [Deleting](#deleting)
  - [Relationships and Foreign Records](#relationships-and-foreign-records)
    - [Configuring a Relationship](#configuring-a-relationship)
      - [One-to-One Relationship](#one-to-one-relationship)
      - [One-to-Many Relationship](#one-to-many-relationship)
    - [Including your foreign record](#including-your-foreign-record)
  - [Miscellaneous](#miscellaneous)
  - [Built-in event listeners](#built-in-event-listeners)
  - [Future plans](#future-plans)

# Chinook Database Schema

This README uses all of its examples using a Chinook database. You can see the chinook database, including schema, and other important information [here](https://docs.yugabyte.com/preview/sample-data/chinook/#:~:text=About%20the%20Chinook%20database,from%20an%20Apple%20iTunes%20library.)

However, I found the .sql files they provide do not work with MySQL, so in this repository, there lies a "initdb.sql" file you can use to set up your local chinook database.

If you'd like to set up a Docker container to run the Chinook database on localhost:3306, then follow these instructions

1.) Create a Dockerfile  
```Dockerfile
FROM mysql:latest

MAINTAINER me

ENV MYSQL_ROOT_PASSWORD=root

ADD initdb.sql /docker-entrypoint-initdb.d
```
2.) In the same directory as the Dockerfile, create a new file called "initdb.sql" with the contents from [here](https://raw.githubusercontent.com/traviszuleger/mysql-contexts/main/lib/src/examples/initdb.sql)  
3.) From the command line, in the same directory as your Dockerfile and "initdb.sql", run the following instructions  
```
sudo docker build --tag chinook_example_image .
sudo docker run -d -p 3306:3306 --name chinook-example-db chinook_example_image:latest
```

# Creating a Table Context

Unlike creating database contexts like in `Entity Framework Core`, `MyORM` specifically works with table contexts. Each table context you create will only work with that table (excluding operations with `.include()`, or joining tables)

The process of working with `MyORM` is:  
1. Type defining interfaces so MyORM typing can kick in and assist.
2. Creating a pool to construct your context
3. Constructing your `MyORMContext`

## Type Safe interfaces

Since `MyORM` is an object-relationship model, your types should perfectly resemble your Table as it appears in your database. 

The below example is how an interface should look that represents the Customer table in our chinook database.

```ts
interface Customer {
    CustomerId: number;
    FirstName: string;
    LastName: string;
    Company?: string;
    Address?: string;
    City?: string;
    State?: string;
    Country?: string;
    PostalCode?: string;
    Phone?: string;
    Fax?: string;
    Email: string;
    SupportRepId?: number;
};
```

How the Table is defined in chinook:  

```sql
CREATE TABLE Customer
(
    CustomerId INT NOT NULL,
    FirstName VARCHAR(40) NOT NULL,
    LastName VARCHAR(20) NOT NULL,
    Company VARCHAR(80),
    Address VARCHAR(70),
    City VARCHAR(40),
    State VARCHAR(40),
    Country VARCHAR(40),
    PostalCode VARCHAR(10),
    Phone VARCHAR(24),
    Fax VARCHAR(24),
    Email VARCHAR(60) NOT NULL,
    SupportRepId INT,
    CONSTRAINT PK_Customer PRIMARY KEY  (CustomerId)
);
```

As you can see, nullable types, as defined in the database, have "?" appended after their property key in the interface. If you improperly define your table model, this may stump you later on.

__Note: Primary keys should be annotated as a non-nullable, but if the key is an AUTO_INCREMENT column, then you can specify it as nullable. This will help you later when you insert records into the database. (see [Inserting](#inserting) for more details)__

## Constructor syntax

The constructor for a `MySqlTableContext` is defined as:

```ts
MyORMContext<TTableModel extends AbstractModel, TAliasMap extends AbstractModel=TTableModel>(configOrPool: MySql2PoolOptions|MySql2Pool, table: string, identityKey: keyof MyTableModel = null, options: TableContextOptions = {});
```

The type parameters you pass into your `MyORMContext` are described as follows.
  - `TTableModel`: This is the model that represents your SQL table. The extension, `AbstractModel`, is defined below, but is essentially an `any` object, but for only `string` keys.
  - `TAliasMap`: This is insignificant to you as the user of this library. **IF you define this yourself, you may have type errors down the road. This is specifically meant for the `.alias()` function.**

The parameters you pass into your `MyORMContext` are described as follows.
  - `configOrPool`: This is either a `MySql2PoolOptions` model object, where you create a pool on the fly, or this is a `MySql2Pool`, where you pass in an already created pool.
  - `table`: __IMPORTANT:__ This needs to be the full name of the Table this context represents. If this is named incorrectly, your commands will not work.
  - `identityKey`: This is optional, but is important if you want insert functions to reassign the insert Ids back to the model object you inserted.
  - `options`: This is optional, and is rather unimportant, but is used for specifying options like `allowTruncation` and `allowUpdateOnAll`. These two properties are defaulted to false, protecting your Table from accidents involving truncation or updates on all records.

__More documentation on MySqlTableContext can be found [here](https://pkgs.traviszuleger.com/mysql-contexts/MySqlTableContext)__

## Construction Examples

Here are some examples of constructing a MyORMContext using the chinook database.

Creating a MyORMContext for `Customer` and the pool is created for us.

```ts
import MySqlTableContext from '@tzuleger/mysql-contexts';
import type { Customer } from "./chinook-types";

// Port is defaulted to 3306, but in our setup we defined port to be 10500.
const customerCtx = new MySqlTableContext<Customer>({ host: "127.0.0.1", port: 10500, database: "chinook", user: "root", password: "root" }, "Customer");
```

In the event you want to connect to two separate tables without creating a new Connection every time, you can call the static function, `MyORMContext.createPool()`, to which you can pass as an argument in place of the `MySql2PoolOptions` like above.  

```ts
import MySqlTableContext from '@tzuleger/mysql-contexts';
import type { Customer, Artist } from "./chinook-types";

// Port is defaulted to 3306.
const pool = MySqlTableContext.createPool({ host: "127.0.0.1", port: 10500, database: "chinook", user: "root", password: "root" });
const customerCtx = new MySqlTableContext<Customer>(pool, "Customer");
const artistCtx = new MySqlTableContext<Artist>(pool, "Artist");
```

Given your represented Table has a key column defined as an AUTO_INCREMENT column, then you would need to do the following.

```ts
import MySqlTableContext from '@tzuleger/mysql-contexts';
import type { Customer } from "./chinook-types";

type CustomerWithAutoIncrementId = Customer & { Id?: number }; // Assuming that there exists an AUTO_INCREMENT primary key on Customer called "Id".

// Port is defaulted to 3306.
const pool = MySqlTableContext.createPool({ host: "127.0.0.1", port: 10500, database: "chinook", user: "root", password: "root" });
const customerCtx = new MySqlTableContext<CustomerWithAutoIncrementId>(pool, "Customer", "Id");
```

# Querying

As mentioned at the beginning of this README, the syntax for `MyORM` is very similar to EFC, so if you're familiar with that, this should be a cake walk.

## Query all records (SELECT)

To query all records from a table, it's as simple as using the function, `select()`.  

The `.select()` function takes no arguments, and will simply grab all of the relative records from your built query (`SELECT`) command.

Here is an example of querying all records from `chinook.Track`:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const tracks = await trackCtx.select();
```

The above statement will generate the following `SQL` statement (this command is sanitized when sent over `mysql2`):

```sql
SELECT * FROM `Track`
```

## Query some records based on condition(s) (WHERE)

To query records from a table, filtered based off some condition, you can use the `.where(modelCallback)` function.  

The `.where()` function takes one argument, which is a callback that provides an argument as the `TTableModel` type where each parameter returns a `WhereBuilder` class object, which is used to create conditions on your query. If you are using VS Code or some IDE with intellisense, and you created `MyORMContext` with the correct type parameters, these will be easily available to you. (__NOTE: Any properties in your model associated with your table that are non-primitive will have a `$` prepended to it. You'll see more on this in the `@TODO` section__)  

### WhereBuilder

The `WhereBuilder` class provides the following functions for conditioning your query:

- `equals(value)`: Adds a condition to the WHERE clause where if the specified column is equal to the value specified.
    - Synonyms: `eq`
- `notEquals(value)`: Adds a condition to the WHERE clause where if the specified column is not equal to the value specified.
    - Synonyms: `neq`
- `lessThan(value)`: Adds a condition to the WHERE clause where if the specified column is less than the value specified.
    - Synonyms: `lt`
- `lessThanOrEqualTo(value)`: Adds a condition to the WHERE clause where if the specified column is less than or equal to the value specified.
    - Synonyms: `lteq`
- `greaterThan(value)`: Adds a condition to the WHERE clause where if the specified column is greater than the value specified.
    - Synonyms: `gt`
- `greaterThanOrEqualTo(value): Adds a condition to the WHERE clause where if the specified column is greater than or equal to the value specified.
    - Synonyms: `gteq`
- `in(values)`: Adds a condition to the WHERE clause where if the specified column is equal to any of the values specified.
    - No synonyms
- `like(value)`: Adds a condition to the WHERE clause where if the specified column, as a string, is like, by SQL's LIKE command syntax, the value specified. This operation is case insensitive.
    - No synonyms
    - NOTE: `value` must be a string, as this is the only syntactically correct right-hand parameter for the SQL `LIKE` clause.
- `contains(value)`: Adds a condition to the WHERE clause where if the specified column, as a string, contains the value specified. This operation is case insensitive.
    - No synonyms
    - This builds a LIKE clause with right-hand argument of `%{value}%`.
    - NOTE: `value` must be a string, as this is the only syntactically correct right-hand parameter for the SQL `LIKE` clause.

__NOTE: All values (except for values in `.like()` and `.contains()`) are of the respective type to the last property referenced.__

### One Condition

Filtering your query on one condition is straight-forward, where you just need to pass in the condition you need.

Here is an example of querying all records where the `Composer`'s name equals `AC/DC`:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const tracks = await trackCtx
    .where(m => m.Composer.eq("AC/DC"))
    .select();
```

The above statement will generate the following `SQL` statement (this command is sanitized when sent over `mysql2`):

```sql
SELECT * FROM `Track`
        WHERE `Track`.`Composer` = ?
```

### Chained Conditions

Filtering your query with more than one condition is also pretty straight-forward. For every conditional function from `WhereBuilder` used, you get a returned object that has the callback parameters, `and` and `or`.  
These `and` and `or` functions return a chain back to itself, meaning you can continue to use `and` and `or` on the initial calls.  
This allows you to chain your conditions with ease.  

Here is an example of querying all records where the `Composer` equals `AC/DC` and the `Name` equals `"Dog Eat Dog"`.

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const tracks = await trackCtx
    .where(m => m.Composer.eq("AC/DC")
        .and(m => m.Name.eq("Dog Eat Dog")))
    .select();
```

The above statement will generate the following `SQL` statement (this command is sanitized when sent over `mysql2`):

```sql
SELECT * FROM `Track` 
        WHERE `Track`.`Composer` = ?
        AND `Track`.`Name` = ?
```

### Nested Conditions

Chaining conditions is one thing, and most of the time will accomplish what you need. However, there will be some queries where you need a nested condition. This is where things might get a little confusing, but will make sense after this subsection.  

As mentioned before, every conditional function from `WhereBuilder` used, you get a returned object that has the callback parameters, `and` and `or`. Additionally, you also get the `and` and `or` parameters from themselves...

When chaining an `and` or an `or` on a `WhereBuilder` condition (e.g., `.equals()`, `.lessThan()`, etc.) you will actually starting a nest of conditions. So if you want to `nest` your conditions, you will further tag `.and()` or `.or()` on your `WhereBuilder` conditions, whereas if you want to chain onto your conditions, you must tag `.and()` or `.or()` on your `.and()` or `.or()` functions.  

This can get a little confusing, especially with the parentheses, but with some proper styling, you can visualize what your SQL statement will look like.

Just remember it like this:  

`If you add .and() DIRECTLY to your last condition, you are nesting the last condition and the next condition together. (In other words, you are wrapping the two conditions in a parentheses)`  
`If you add .and() to your latest chaining clause (e.g., ".and()" or ".or()"), you are chaining the last condition and the next together.`  

Below are some examples of both nesting, chaining, and a combination of thw two.  

Nesting:  

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const ts = await trackCtx
        .where(m => m.Composer.eq("AC/DC")
            .and(m => m.Name.eq("Dog Eat Dog")
                .or(m => m.Name.contains("go")
                    .and(m => m.Name.contains("down")
                        .and(m => m.Bytes.lessThan(2 ** 53))))
                .or(m => m.Name.contains("let")
                    .and(m => m.Name.contains("rock")
                        .and(m => m.Bytes.lessThan(2 ** 53)))))
            .and(m => m.AlbumId.eq(4)))
        .select();
```

The above statement will generate the following `SQL` statement (this command is sanitized when sent over `mysql2`):

```sql
SELECT * FROM `Track` 
        WHERE `Track`.`Composer` = ?
            AND (`Track`.`Name` = ?
                    OR (`Track`.`Name` LIKE ?
                            AND (`Track`.`Name` LIKE ?
                                    AND `Track`.`Bytes` < ?))
                    OR (`Track`.`Name` LIKE ?
                            AND (`Track`.`Name` LIKE ?
                                    AND `Track`.`Bytes` < ?)))
            AND `Track`.`AlbumId` = ?
```

Chaining:  

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const ts = await trackCtx
        .where(m => m.Composer.eq("AC/DC")
            .and(m => m.Name.eq("Dog Eat Dog"))
            .or(m => m.Name.eq("Go Down"))
            .and(m => m.AlbumId.eq(4)))
        .select();
```

The above statement will generate the following `SQL` statement (this command is sanitized when sent over `mysql2`):

```sql
SELECT * FROM `Track` 
        WHERE `Track`.`Composer` = ?
                AND `Track`.`Name` = ?
                OR `Track`.`Name` = ?
                AND `Track`.`AlbumId` = ?
```

As mentioned, you can format your code similarly to how you would format a SQL statement, and then you can visualize how it will end up looking.

Finally, here is an example using both:

```ts
const pool = MyORMContext.createPool({ database: "chinook", host: "localhost", port: 3306, user: "root", password: "root" });
const trackCtx = new MyORMContext<Track>(pool, "Track"); 
const ts = await trackCtx
        .where(m => m.Composer.eq("AC/DC")
            .and(m => m.Name.eq("Dog Eat Dog")
                .or(m => m.Name.contains("go")
                    .and(m => m.Name.contains("down"))
                    .and(m => m.Bytes.lessThan(2 ** 53))))
            .and(m => m.AlbumId.eq(4)))
        .select();
```

The above statement will generate the following `SQL` statement (this command is sanitized when sent over `mysql2`):

```sql
SELECT * FROM `Track`
        WHERE `Track`.`Composer` = ?
                AND (`Track`.`Name` = ?
                        OR (`Track`.`Name` LIKE ?
                                AND `Track`.`Name` LIKE ?
                                AND `Track`.`Bytes` < ?))
                AND `Track`.`AlbumId` = ?
```

One last quick note: All of these WHERE conditions are built with a heavy amount of recursion, so if you plan to call an exact query multiple times, you should plan to use the [Views](@todo)

# Inserting

__Note: Insert functions are only available to single table contexts. Attempting to insert on a joined context results in an Error.__

Inserting into our table is not as nearly as complex as any other class function. Inserting is handled with two class functions. These functions are `.insertOne()` and `.insertMany()`.

  - `.insertOne(record)`: Inserts one record into the table and returns the record inserted. If `autoIncrementKey` was specified in the constructor, then the returned record will have the new Id assigned to it.
  - `.insertMany(records)`: Inserts many records into the table and returns an array of the records inserted. If `autoIncrementKey` was specified in the constructor, then the returned records will all have their new Id assigned to them.

__Important: If your table has an AUTO_INCREMENT column, and the record you're trying to insert has the key to that column, then that key will be deleted before it is inserted, since it will be automatically assigned after getting inserted. With this being the case, the one exception when typing your object models is making your primary key nullable IF AND ONLY IF that key is an AUTO_INCREMENT column. Otherwise, if you want to maintain the integrity of your interface to the Table representation, you can keep the key as a non-nullable and just pass some unimportant data into that property (like 0) when inserting.__

__Side Note: The keys of your inserted objects are not sorted for the final generated statement. This is the default behavior, and although there *should* not be any issues, you can set sortKeys in the `TableContextOptions` to true. This may prevent any mangling of key/value pairs.__

Here is an example of inserting one record:

```ts
// ... initialization

const nextId = customerCtx.count() + 1;
const customer = customerCtx.insertOne({
    CustomerId: nextId, // required, as defined in our Customer interface. If this property were removed, then this would NOT be type-valid
    FirstName: 'John', // required
    LastName: 'Doe', // required
    Email: 'johndoe@example.com', // required
    Phone: '111-222-3333' // nullable, as defined in our Customer interface. Since this is optional, this property could be removed and this would still be type-valid. 
});
```

The above example builds the following MySQL statement (not formatted to actual command that is sent):

```sql
INSERT INTO Customer 
    (CustomerId, FirstName, LastName, Email, Phone) 
    VALUES 
    ({nextId}, 'John', 'Doe', 'johndoe@example.com', '111-222-3333');
```

Here is an example of inserting one record, where the Table has an AUTO_INCREMENT key.

```ts
// Notice how I set Id: number to a nullable property.
type CustomerWithAutoIncrementId = Customer & { Id?: number };
const pool = MySqlTableContext.createPool({ host: "127.0.0.1", port: 10500, database: "chinook", user: "root", password: "root" });
const customerCtx = new MySqlTableContext<CustomerWithAutoIncrementId>(pool, "Customer", "Id");

const customer = customerCtx.insertOne({
    CustomerId: 99999999, // required, as defined in our Customer interface. If this property were removed, then this would NOT be type-valid
    FirstName: 'John', // required
    LastName: 'Doe', // required
    Email: 'johndoe@example.com', // required
    Phone: '111-222-3333' // nullable, as defined in our Customer interface. Since this is optional, this property could be removed and this would still be type-valid. 
});
console.log(customer.Id); // this will display the Id that was assigned from MySQL to the console
```

The above example builds the following MySQL statement (not formatted to actual command that is sent):

```sql
INSERT INTO Customer 
    (CustomerId, FirstName, LastName, Email, Phone) 
    VALUES 
    ({nextId}, 'John', 'Doe', 'johndoe@example.com', '111-222-3333');
```

Here is an example of inserting multiple records.

```ts
// ... initialization

const nextId = customerCtx.count();
const customer = customerCtx.insertMany([{
    CustomerId: ++nextId, // required, as defined in our Customer interface. If this property were removed, then this would NOT be type-valid
    FirstName: 'John', // required
    LastName: 'Doe', // required
    Email: 'johndoe@example.com', // required
    Phone: '111-222-3333' // nullable, as defined in our Customer interface. Since this is optional, this property could be removed and this would still be type-valid. 
}, {
    CustomerId: ++nextId, // required, as defined in our Customer interface. If this property were removed, then this would NOT be type-valid
    FirstName: 'Jane', // required
    LastName: 'Doe', // required
    Email: 'janedoe@example.com', // required
}]);
```

The above example builds the following MySQL statement (not formatted to actual command that is sent):

```sql
INSERT INTO Customer 
    (CustomerId, FirstName, LastName, Email, Phone) 
    VALUES 
    ({nextId}, 'John', 'Doe', 'johndoe@example.com', '111-222-3333')
    ,({nextId}, 'John', 'Doe', 'janedoe@example.com', NULL);
```

You can also insert many different records where some may have nullable columns filled out, while others do not. All keys will be appropriately mapped into the `INSERT` statement.

Here is an example of inserting multiple records with different nullable columns:

```ts
// initialization

const custs = await customerCtx.insertMany([{
        CustomerId: 9998,
        FirstName: 'John',
        LastName: 'Doe',
        Email: 'johndoe@gmail.com',
        Phone: '111-222-3333' // see how we are adding a phone number for John Doe, but not Jane?
    }, {
        CustomerId: 9999,
        FirstName: 'Jane',
        LastName: 'Doe',
        Email: 'janedoe@gmail.com',
        City: "Des Moines", // inversely, Jane Doe doesn't have a Phone number, but Jane does have a "City", "State", and "Country", while John Doe does not have these columns specified.
        State: "IA",
        Country: "USA"
    }
]);
```

The above example builds the following MySQL statement (not formatted to actual command that is sent):

```sql
INSERT INTO Customer 
    (CustomerId, FirstName, LastName, Email, Phone, City, State, Country) 
    VALUES 
    (9998,'John','Doe','johndoe@gmail.com','111-222-3333',null,null,null)
    ,(9999,'Jane','Doe','janedoe@gmail.com',null,'Des Moines','IA','USA')
```

Thanks to the above behavior, you should not feel the need to pre-define every last one of your records to have every key (representing the column) inserted. This is all handled automatically by `MySqlTableContext`.

# Updating

The update commands have access to the WHERE clause builder function. You can reference adding WHERE clauses [here](#where-clause)

Unlike inserting, updating requires one parameter argument that is a representation of what is to be updated in your table. What you are specifically updating is up to you, using the `WhereBuilderFunction` argument.

__Note: If, by chance, you do not include the `WhereBuilderFunction` argument, then an Error will be thrown telling you to use the `.updateAll()` function. However, in order to use the `.updateAll()` function, you need to also have `allowUpdateAll` set to true in your `TableContextOptions` that is specified from the constructor. If this is otherwise, false, and you call the `.updateAll()` function, then another Error will be thrown. This is a series of protective measures to really make sure you want to update all of your records in that table. This same behavior appears in the `.delete()` function.__

As of v1.0, there are two functions, `.update()` and `.updateAll()`. `.updateAll()` is not intended to be used, but the option is there (with protective measures to prevent accidents)

  - `.update(record[, where = null])`: Updates all records that are filtered from the WHERE clause (built and specified by `where`) to the values that are found from the `Partial<TTableModel>` object, `record`. The return value is the number of affected rows.
  - `.updateAll(record)`: Updates ALL records in the database under the table this `MySqlTableContext` represents to the values that are found from the `Partial<TTableModel>` object, `record`. This function is protected where Errors are thrown unless the developer explictly passes in `allowUpdateAll` into the constructor's `TableContextOptions` parameter. (__WARNING: Do NOT use this function unless you are REALLY sure you want to update EVERY record in your table.__)

The use of the `.update()` function is somewhat confusing. The `record` parameter is meant to be a map of what column/values are to be changed. Then the `where` parameter is just like any other `WhereBuilderFunction` parameter that you can use to build a WHERE clause on what records you would like to update.

Unlike the query and insert functions, the `.update()` function returns a number that represents the number of rows affected.

Here is an example of updating one column on one record:

```ts
// ... initialization

// change the email for all Customers with the first name "John" and last name "Doe" to "johndoe2@gmail.com".
customerCtx.update({
    Email: "johndoe2@gmail.com"
}, where => where.equals("FirstName", "John").andEquals("LastName", "Doe"));
```

The above example builds the following MySQL statement (not formatted to actual command that is sent):

```sql
UPDATE Customer 
    SET Email='johndoe2@gmail.com'
    WHERE FirstName = 'John'
        AND LastName = 'Doe';
```

__Note: The above example is "for one record", but if there are multiple Customers in the database named "John Doe", then all of them would have been updated.__  
Here is an example of updating multiple columns on one record:

```ts
// ... initialization

// change the email and phone for all Customers with the first name "John" and last name "Doe" to "johndoe2@gmail.com" and "111-222-3333".
customerCtx.update({
    Email: "johndoe2@gmail.com",
    Phone: "111-222-3333"
}, where => where.equals("FirstName", "John").andEquals("LastName", "Doe"));
```

__Note: The above example is "for one record", but if there are multiple Customers in the database named "John Doe", then all of them would have been updated.__  
The above example builds the following MySQL statement (not formatted to actual command that is sent):

```sql
UPDATE Customer 
    SET Email='johndoe2@gmail.com'
        ,Phone='111-222-3333'
    WHERE FirstName = 'John'
        AND LastName = 'Doe';
```

Here is an example of updating multiple columns on multiple records.

```ts
// ... initialization

// change the email and phone for all Customers with last name "Doe" to "johnandjane@gmail.com" and "111-222-3333".
customerCtx.update({
    Email: "johnandjanedoe@gmail.com",
    Phone: "111-222-3333"
}, where => where.equals("LastName", "Doe"));
```

The above example builds the following MySQL statement (not formatted to actual command that is sent):

```sql
UPDATE Customer 
    SET Email='johnandjanedoe@gmail.com'
        ,Phone='111-222-3333'
    WHERE LastName = 'Doe';
```

__IMPORTANT: As stated from the notes above, these updates can inadvertently change other records we may not want to change. With this being the case, the use of `WhereBuilder`'s `.isIn()` function is strong, where you should specify the primary keys of all of the records you want to update. Otherwise, you can build your WHERE clause strongly by specifying a lot of column values to be unique to the records you want to change.__

As stated above, there is a way to update all records on your table. If you attempt to update all records using `.update()`, then you will get an Error that tells you to use the `.updateAll()` function. If you use the `.updateAll()` function, you will also get an Error telling you to explicitly set the `TableContextOptions` `allowUpdateAll` option to `true`. These Errors are purposefully and redundantly placed for the reason of protecting your data. However, there may be some cases, where updating all records, are useful, (I can't think of any, but maybe you can?) so the `.updateAll()` function was created.

`.updateAll()` is simple. Other than having to explicitly set `allowUpdateAll` to `true` when using this function, as the syntax is the same as `.update()`, except `.updateAll()` does NOT have a `WhereBuilderFunction` parameter. 

Here is an example of updating all of your records. (__I'm begging you, please do not use this function unless you really know what you are doing__)

```ts
// ... initialization

// change all records in the table to have a NULL email. (...)
customerCtx.updateAll({
    Email: null
});
```

The above example builds the following MySQL statement (not formatted to actual command that is sent):

```sql
UPDATE Customer 
    SET Email=NULL;
```

__Please do not complain to me that you got fired because you chose to use this function. You have been warned.__

# Deleting

The delete commands have access to the WHERE clause builder function. You can reference adding WHERE clauses [here](#where-clause)

Deleting records is almost the same syntax as your `.insert()` function, except you only specify the `WhereBuilderFunction` parameter.  

As of v1.0, there are two functions for deleting. These functions are `.delete()` and `.truncate()`. There are intended to be more functions in the future, these functions are `.deleteOne()` and `.deleteMany()`.

  - `.delete(where)`: Deletes all records that are filtered from the WHERE clause built from the `WhereBuilderFunction` parameter, `where`. The return value is the number of affected rows.
  - `.truncate()`: Deletes ALL records in the database under the table this `MySqlTableContext` represents. This function is protected where Errors are thrown unless the developer explictly passes in `allowTruncation` into the constructor's `TableContextOptions` parameter. (__WARNING: Do NOT use this function unless you are REALLY sure you want to delete EVERY record in your table.__)
  - `.deleteOne(record)`: Deletes one record from the table.
  - `.deleteMany(records)`: Deletes many records from the table.

Since we covered the `WhereBuilderFunction` parameter countless times in this documentation, the syntax should seem self-explanatory.

Here is an example of deleting one record using `.delete()`:

```ts
// ... initialization

// delete the Customer that has the Id of 9999
customerCtx.delete(where => where.equals("CustomerId", 9999));
```

The above example builds the following MySQL statement (not formatted to actual command that is sent):

```sql
DELETE FROM Customer 
    WHERE CustomerId=9999;
```

Here is an example of deleting many records using `.delete()`:

```ts
// ... initialization

// delete the Customers that have the Id of 9998 or 9999
customerCtx.delete(where => where.isIn("CustomerId", [9998, 9999]));
```

The above example builds the following MySQL statement (not formatted to actual command that is sent):

```sql
DELETE FROM Customer 
    WHERE CustomerId IN (9998, 9999);
```

Here is an example of deleting one record using `.deleteOne()` (AS OF v1.0 THIS IS NOT IMPLEMENTED YET.)

```ts
// ... initialization

// delete the Customers that have the Id of 9998 or 9999
customerCtx.deleteOne({
    CustomerId: 9998,
    FirstName: "John",
    LastName: "Doe",
    Email: "johndoe@gmail.com"
});
```

The above example builds the following MySQL statement (not formatted to actual command that is sent):

```sql
DELETE FROM Customer 
    WHERE CustomerId=9998 AND FirstName='John' AND LastName='Doe' AND Email='johndoe@gmail.com';
```

Here is an example of deleting many records using `.deleteMany()` (AS OF v1.0 THIS IS NOT IMPLEMENTED YET.)

```ts
// ... initialization

// delete the Customers that have the Id of 9998 or 9999
customerCtx.deleteMany([{
    CustomerId: 9998,
    FirstName: "John",
    LastName: "Doe",
    Email: "johndoe@gmail.com"
}, {
    CustomerId: 9999,
    FirstName: "Jane",
    LastName: "Doe",
    Email: "janedoe@gmail.com",
    Phone: "111-222-3333"
}]);
```

The above example builds the following MySQL statement (not formatted to actual command that is sent):

```sql
DELETE FROM Customer 
    WHERE (CustomerId=9998 AND FirstName='John' AND LastName='Doe' AND Email='johndoe@gmail.com')
        OR (CustomerId=9999 AND FirstName='Jane' AND LastName='Doe' AND Email='janedoe@gmail.com' AND Phone='111-222-333');
```

As stated above, there is a way to truncate your table. If you attempt to delete all records using `.delete()` (in the future `.deleteOne()` and `.deleteMany()` will also be protected), then you will get an Error that tells you to use the `.truncate()` function. If you use the `.truncate()` function, you will also get an Error telling you to explicitly set the `TableContextOptions` `allowTruncation` option to `true`. These Errors are purposefully and redundantly placed for the reason of protecting your data. However, there may be some cases, where deleting records, are useful, (I can't think of any, but maybe you can?) so the `.truncate()` function was created.

`.truncate()` is simple. Other than having to explicitly set `allowUpdateAll` to `true` when using this function, all you have to do is call the function.

Here is an example of truncating the table: (__I'm begging you, please do not use this function unless you really know what you are doing__)

```ts
// ... initialization

// truncate the table (...)
customerCtx.truncate();
```

The above example builds the following MySQL statement (not formatted to actual command that is sent):

```sql
TRUNCATE Customer;
```

__Please do not complain to me that you got fired because you chose to use this function. You have been warned.__

# Relationships and Foreign Records

In libraries like .NET's Entity Framework Core, you'll see that you can configure Foreign records to your record types.  

This behavior is helpful for being able to reference a relating object to something you may have already queried.

This feature needs more work, and may not be efficient nor fast right now, but it is available as of 1.1.

## Configuring a Relationship

This section will go into how to configure a type of relationship on a Table Context.

When configuring your relationship, you have one of two functions you can call on your context after construction.
  - `.hasOne(relationshipCallback)`: Configures a One to One relationship on that Table given the Relationship callback.
    - The relationship callback uses a `Proxy` to detect what field you are attempting to create a relationship on. The properties available through TypeScript will be the keys you have configured in your interface filtered by which keys that map to some `AbstractModel` object (`{[key: string]: any}`). Then you will have access to a chaining of a few functions: `.from(realTableName).with(thisColumn).to(thatColumn)`.
  - `.hasMany(relationshipCallback)`: Configures a One to Many relationship on that Table given the Relationship callback.
    - The relationship callback uses a `Proxy` to detect what field you are attempting to create a relationship on. The properties available through TypeScript will be the keys you have configured in your interface filtered by which keys that map to some array of `AbstractModel`s (`{[key: string]: any}`). Then you will have access to a chaining of a few functions: `.from(realTableName).with(thisColumn).to(thatColumn)`.

### One-to-One Relationship

One to One Relationships is the relationship of one Record having one Record. The behavior for a One-to-One record in MyORM is a little different right now. If you specify a "one to one relationship", it can either be a "many to one" or a "one to one" relationship. It is quite broad but gets the behavior you are looking for in all situations.

Here is an example of how to configure a one-to-one relationship.

```ts
import { MySqlTableContext } from "@tzuleger/mysql-contexts";

interface Track {
    TrackId: number;
    Name: string;
    AlbumId: number;
    MediaTypeId: number;
    GenreId: number;
    Composer: number;
    Milliseconds: number;
    Bytes: number;
    UnitPrice: number;
    Artist?: Artist;
}

interface Artist {
    ArtistId: number;
    Name?: string;
    Tracks?: Track[];
};

const pool = MySqlTableContext.createPool({ host: "localhost", port: 3306, database: "chinook", user: "root", password: "mySuperSecretPassword" });
const tracks: MySqlTableContext<Track> = new MySqlTableContext<Track>(pool, "Track");

tracks.hasOne(m => m.Artist.from("Artist").with("Composer").to("Name"));
```

### One-to-Many Relationship

One to Many Relationships is the relationship of one Record having many Records.

Here is an example of how to configure a one-to-many relationship.

```ts
import { MySqlTableContext } from "@tzuleger/mysql-contexts";

interface Track {
    TrackId: number;
    Name: string;
    AlbumId: number;
    MediaTypeId: number;
    GenreId: number;
    Composer: number;
    Milliseconds: number;
    Bytes: number;
    UnitPrice: number;
    Artists?: Artist[];
}

interface Artist {
    ArtistId: number;
    Name?: string;
    Tracks?: Track[];
};

const pool = MySqlTableContext.createPool({ host: "localhost", port: 3306, database: "chinook", user: "root", password: "mySuperSecretPassword" });
const tracks: MySqlTableContext<Track> = new MySqlTableContext<Track>(pool, "Track");

tracks.hasMany(m => m.Artists.from("Artist").with("Composer").to("Name"));
```

## Including your foreign record

The relationship configuration isn't enough to get what you want accomplished, as when this feature was developed, the idea in mind was that sometimes the user may want to query a record with their relationship at one point, but at another just want the bare fields for the original record.

The syntax for including is simple: `.include(includeCallback)` where your includeCallback is just a Proxy that detects the property you reference.

Here is an example of including a record in a query:

```ts
import { MySqlTableContext } from "@tzuleger/mysql-contexts";

interface Track {
    TrackId: number;
    Name: string;
    AlbumId: number;
    MediaTypeId: number;
    GenreId: number;
    Composer: number;
    Milliseconds: number;
    Bytes: number;
    UnitPrice: number;
    Artist?: Artist;
}

interface Artist {
    ArtistId: number;
    Name?: string;
    Tracks?: Track[];
};

const pool = MySqlTableContext.createPool({ host: "localhost", port: 3306, database: "chinook", user: "root", password: "mySuperSecretPassword" });
const tracks: MySqlTableContext<Track> = new MySqlTableContext<Track>(pool, "Track");

tracks.hasOne(m => m.Artist.from("Artist").with("Composer").to("Name"));

const apocalypticaTracks = await tracks.include(m => m.Artist).getAll(where => where.equals("Composer", "Apocalyptica"));

console.log(`${apocalypticaTracks[0].Name} by ${apocalypticaTracks[0].Artist.Name}`);
// prints out: "Enter Sandman by Apocalyptica"
```

The above example builds the following MySQL statement (not formatted to actual command that is sent):

```sql
SELECT * 
    FROM `Track`
    WHERE `Composer` = Apocalyptica 
    LIMIT 1;
-- and
SELECT * 
    FROM `Artist` 
    WHERE `Artist`.`Name` = Apocalyptica;
```

# Joining tables (deprecated)

Joining tables is a little bit more intuitive, as it requires you to explicitly define your keys that you are joining on. This may become easier, syntactically, in the future.

__NOTE: As of v1.0, you can only join on a singular key. There are plans to make it so you can add AND and OR conditionals.__

Joined tables require you to have two already constructed `MySqlTableContext` class objects. All `MySqlTableContext` class objects have class functions to join respective to the type of join you would like to do. These functions are `.join()`, `.leftJoin()`, and `.rightJoin()`. There is no option to do an outer join (yet).

You can also join already joined tables onto other tables as well. There are some examples of this in the [(INNER) JOIN](#inner-join) subsection.

You can read about how joining tables work [here](https://dev.mysql.com/doc/refman/8.0/en/join.html).

__NOTE: You may only use the `.count()`, `.get()`, `.getAll()`, `.join()`, `.leftJoin()`, and `.rightJoin()` functions on joined contexts. An attempt to use any other function will result in an Error being thrown.__

## (INNER) JOIN

Tables that are `INNER JOIN`ed together means that the records returned will only be records where the joining keys matched. In other words, using chinook as an example, if we joined the `Customer` table to the `Employee` table, the only records that would return from a query would be records of `Customer`s who are ALSO `Employee`s.  

To perform an `INNER JOIN` on two tables, you need to use the function, `.join()` from one of the tables you want to join on.

  - `.join(that, leftData, rightData)`: Join `this` table and `that` table together using `leftData` to specify the left side of the ON {condition} argument and `rightData` to specify the right side of the ON {condition} argument.

Given two table contexts, `MySqlTableContext<FooRecord>` and `MySqlTableContext<BarRecord>`, the return type for `.join()` will be of type: `FooRecord & BarRecord`

The `leftData` and `rightData` may be a little confusing, but it essentially gives you more freedom of what keys you want the two tables to join on. Both parameters are objects that has two properties, `key` and `name`.
  
  - `key`: Some key of TTableModel to use on the left side of the ON {condition} clause.
  - `name`: (optional) Name of the table where the `key` property comes from. This is because the key does not implicitly know which Table it is coming from, in the case where a key is coming from an already joined table model AND that key appears in both tables.

Here is an example of doing a regular join:

```ts
const customerCtx = new MySqlTableContext<Customer>(pool, "Customer");
const employeeCtx = new MySqlTableContext<Employee>(pool, "Employee");

const customersWhoAreEmployees = customerCtx.join(employeeCtx, { key: "CustomerId" }, { key: "EmployeeId" });
```

__Note: The above does not generate a SQL statement that is pushed immediately, but it would be used when querying__

Here is an example of querying from the above joined context:

```ts
customersWhoAreEmployees.count();
```

The above example builds the following MySQL statement (not formatted to actual command that is sent):

```sql
SELECT COUNT(*) AS $count 
    FROM Customer 
        INNER JOIN Employee ON Customer.CustomerId = Employee.EmployeeId;
```

Joining two tables is nice, but joining three tables is nicer!

You can chain multiple joins together on `MySqlTableContext` class objects to create even larger joined tables!

Here is an example of creating and getting the count of an inner joined table with a depth of 3 tables.

```ts
const artistCtx = new MySqlTableContext<Artist>(pool, "Artist");
const albumCtx = new MySqlTableContext<Album>(pool, "Album");
const trackCtx = new MySqlTableContext<Track>(pool, "Track");

const allTracksFromAllAlbumsByAllArtists = artistCtx
    .join(albumCtx, { key: "ArtistId" }, { key: "ArtistId" })
    .join(trackCtx, { key: "AlbumId" }, { key: "AlbumId" });

// Get the total number of tracks that are in an album by the artist named "AC/DC"
albumCtx.count(where => where.equals("Artist.Name", "AC/DC"));
// This is where things kinda get messy. This is technically type-invalid, because "Artist.Name" isn't a key of any of the contexts that were joined.
// But if we use just "Name", the column of "Name" is too ambiguous, and we get a runtime error.
// In cases like this, it is best to ignore the error and prepend the Table you want.
```

__Note: As mentioned in the block of code, there are certain instances where the typing will say you're wrong, but you won't be. Until I find out a way to infer the map `TJoinedModel`'s keys to a variant of `{table_name}.{column}`, then this will unfortunately be the only way to avoid grabbing ambiguous column names.__

The above example builds the following MySQL statement (not formatted to actual command that is sent):

```sql
SELECT COUNT(*) AS $count 
    FROM Artist 
        INNER JOIN Album ON Artist.ArtistId = Album.ArtistId 
        INNER JOIN Track ON Album.ArtistId = Track.AlbumId 
    WHERE Artist.Name = 'AC/DC'
```

## LEFT (OUTER) JOIN

Tables that are `LEFT JOIN`ed together means that the records returned will be of all records from the left Table (the left table in this context would be `this`) and nullable columns for the right Table (the right table in this context would be `that`). In other words, using chinook as an example, if we joined the `Customer` table to the `Employee` table on a `LEFT JOIN`, the records that would return would be all records from `Customer` that have additional properties from `Employee`. Any matching records from the joining column will have the respective data in the `Employee` properties.

To perform a `LEFT JOIN` on two tables, you need to use the function, `.leftJoin()` from one of the tables you want to join on. The syntax is the same as [INNER JOIN](#inner-join)

Given two table contexts, `MySqlTableContext<FooRecord>` and `MySqlTableContext<BarRecord>`, the return type for `.leftJoin()` will be of type: `Partial<FooRecord> & BarRecord`

Here is an example of doing a left join:

```ts
const customerCtx = new MySqlTableContext<Customer>(pool, "Customer");
const employeeCtx = new MySqlTableContext<Employee>(pool, "Employee");

const allCustomersWithEmployeeInfo = customerCtx.leftJoin(employeeCtx, { key: "CustomerId" }, { key: "EmployeeId" });
```

__Note: The above does not generate a SQL statement that is pushed immediately, but it would be used when querying__

Here is an example of querying from the above joined context:

```ts
customersWhoAreEmployees.count();
```

The above example builds the following MySQL statement (not formatted to actual command that is sent):

```sql
SELECT COUNT(*) AS $count 
    FROM Customer 
        LEFT JOIN Employee ON Customer.CustomerId = Employee.EmployeeId;
```

## RIGHT (OUTER) JOIN

Tables that are `RIGHT JOIN`ed together means that the records returned will be of all records from the right Table (the right table in this context would be `that`) and nullable columns for the left Table (the left table in this context would be `this`). In other words, using chinook as an example, if we joined the `Customer` table to the `Employee` table on a `RIGHT JOIN`, the records that would return would be all records from `Employee` that have additional properties from `Customer`. Any matching records from the joining column will have the respective data in the `Customer` properties.

To perform a `RIGHT JOIN` on two tables, you need to use the function, `.rightJoin()` from one of the tables you want to join on. The syntax is the same as [INNER JOIN](#inner-join)

Given two table contexts, `MySqlTableContext<FooRecord>` and `MySqlTableContext<BarRecord>`, the return type for `.rightJoin()` would be: `MySqlJoinedContext<Partial<FooRecord> & BarRecord>`.

Here is an example of doing a left join:

```ts
const customerCtx = new MySqlTableContext<Customer>(pool, "Customer");
const employeeCtx = new MySqlTableContext<Employee>(pool, "Employee");

const allEmployeesWithCustomerInfo = customerCtx.rightJoin(employeeCtx, { key: "CustomerId" }, { key: "EmployeeId" });
```

__Note: The above does not generate a SQL statement that is pushed immediately, but it would be used when querying__

Here is an example of querying from the above joined context:

```ts
customersWhoAreEmployees.count();
```

The above example builds the following MySQL statement (not formatted to actual command that is sent):

```sql
SELECT COUNT(*) AS $count 
    FROM Customer 
        RIGHT JOIN Employee ON Customer.CustomerId = Employee.EmployeeId;
```

# Miscellaneous

# Built-in event listeners

The MySqlTableContext class has a few functions that allow you to add your own handlers to certain events.  
Events are fired when the table does the following:
 - Inserting record(s)
 - Updating record(s)
 - Querying record(s)
 - Deleting record(s)

You can easily tag on any of these event listeners by calling the `.onQuerySuccess()`, `onQueryFail()`, `.onInsertSuccess()`, `.onInsertFail()`, `.onUpdateSuccess()`, `.onUpdateFail()`, `.onDeleteSuccess()`, or `.onDeleteSuccess()` functions on the Table you want to attach the listener to. Each of these functions take two callback function arguments, `success` and `fail`. Alternatively, you can use the `.onSuccess()` and `.onFail()` functions to apply your listener to ALL events.

  - For "Success" functions - `success: (OnSuccessData) => void`: Callback function that is emitted when the command is successful.
  - For "Fail" functions - `fail: (OnFailData) => void`: Callback function that is emitted when the command failed.

Here is an example of adding event for both successful and unsuccessful Querying events:

```ts
import MySqlTableContext from '@tzuleger/mysql-contexts';
import type { Customer } from "./chinook-types";

type CustomerWithAutoIncrementId = Customer & { Id?: number }; // Assuming that there exists an AUTO_INCREMENT primary key on Customer called "Id".

const loggingPool = MySqlTableContextPool.createPool({ host: "127.0.0.1", port: 10500, database: "logging", user: "root", password: "root" })
const loggingCtx = new MySqlTableContext<{ Id?: number, ErrorDetails: string, Schema: string, Command: string, Sanitized: string, DateOccurred: string }>(loggingPool, "SqlLogs", "Id");
// Port is defaulted to 3306.
const pool = MySqlTableContext.createPool({ host: "127.0.0.1", port: 10500, database: "chinook", user: "root", password: "root" });
const customerCtx = new MySqlTableContext<CustomerWithAutoIncrementId>(pool, "Customer", "Id");
customerCtx.onQuerySuccess(
    ({ affectedRows, dateIso, host, schema, cmdRaw, cmd, args }) => {
        console.log(`${dateIso}: ${host} - Query command executed on ${schema}.`);
    }
);
customerCtx.onQueryFail(
    async ({ error, dateIso, host, schema, cmdRaw, cmd, args }) => {
        await loggingCtx.insertOne({
            ErrorDetails: error,
            Schema: schema,
            Command: cmdRaw,
            Sanitized: cmd,

            DateOccurred: dateIso
        });
    }
);
```

The above code shows how powerful these events can get-- You can log specific data about the failed statement, print it to the command line, or even re-attempt it with a different database. You can also attach multiple events to an event. Each event will be emitted in the order that it was attached.

__NOTE: Attaching a FailHandler onto any command fail event in that `MySqlTableContext` will *still* throw the original Error at time of execution. These event handlers are primarily for logging purposes.__  

# Future plans

This section is dedicated to a list of future add-ons.

## Sub-queries

Right now, Table Contexts only interface to a simple command. Although, sub-queries can be costly, they can be very useful, so it is important to include it.

## Protect function arguments

Right now, almost all functions implicitly handle the typing, making it so TypeScript and JSDOC users can easily keep up with the correct arguments to pass in. However, this library should also be used by vanilla JS users. Since that is the case, all functions should be protected by throwing errors for when the argument isn't what is expected.
