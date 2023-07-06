![myorm-logo-text-description-640x283](https://github.com/myorm/myorm/assets/55516053/011d0513-48b5-44bc-aa1b-06860eeb7517)

# MyORM

The syntax-friendly, type-safe, and easy to use object relational mapping model for your database needs.

# Documentation

Below are a few brief non-descriptive examples of some of the features `MyORM` has to offer using the [mysql-adapter](#mysql).

If you'd like to read about all of the features and what `MyORM` has to offer, you can read more documentation [here](https://github.com/@myorm/myorm)

## Query

```ts
import { MyORMContext } from '@myorm/myorm';
import { adapter, createMySql2Pool } from '@myorm/mysql-adapter';

const pool = createMySql2Pool({ 
    database: "vehicles",
    host: "localhost", 
    user: "root",
    password: "root" 
});
const ctx: MyORMContext<Car> = new MyORMContext(adapter(pool), "Car");

const cars = await ctx
    .where(m => m.Make.equals("Ford")
        .and(m => m.Color.equals("Red")
            .or(m => m.Make.equals("Toyota"))
            .and(m => m.Color.equals("Blue"))))
    .groupBy((m, { avg }) => [
        m.Make, 
        m.Model, 
        m.Color, 
        avg(m.Mileage)
    ])
    .sortBy(m => [
        m.Make,
        m.Model.desc()
    ])
    .skip(2)
    .take(2)
    .select();

console.log(cars);
/** prints (results are not from a legitimate database)
 * {
 *   Make: "Ford",
 *   Model: "Focus",
 *   Color: "Red",
 *   $avg_Mileage: 49999
 * },
 * {
 *   Make: "Toyota",
 *   Model: "Tacoma",
 *   Color: "Blue",
 *   $avg_Mileage: 30000
 * }
 */ 
```

## Insert

Inserting a row when the table has a defined identity key. (A primary key that automatically increments)

```ts
import { MyORMContext } from '@myorm/myorm';
import { adapter, createMySql2Pool } from '@myorm/mysql-adapter';

const pool = createMySql2Pool({ 
    database: "vehicles",
    host: "localhost", 
    user: "root",
    password: "root" 
});
const ctx: MyORMContext<Car> = new MyORMContext(adapter(pool), "Car");

let newCar = {
    Make: "Chevy",
    Model: "Malibu",
    Color: "Yellow",
    Mileage: 15,
    MPGHwy: 38.2,
    MPGCity: 29.9,
    Year: 2020
};

[newCar] = await ctx.insert(newCar);

console.log(newCar);

/** prints (results are not from a legitimate database)
 * {
 *   Id: 1000, // automatically assigned
 *   Make: "Chevy",
 *   Model: "Malibu",
 *   Color: "Yellow",
 *   Mileage: 15,
 *   MPGHwy: 38.2,
 *   MPGCity: 29.9,
 *   Year: 2020
 * }
 */ 
```

## Update

Updating a row implicitly when a primary key is already defined in the record being updated.

```ts
import { MyORMContext } from '@myorm/myorm';
import { adapter, createMySql2Pool } from '@myorm/mysql-adapter';

const pool = createMySql2Pool({ 
    database: "vehicles",
    host: "localhost", 
    user: "root",
    password: "root" 
});
const ctx: MyORMContext<Car> = new MyORMContext(adapter(pool), "Car");

let newCar = {
    Make: "Chevy",
    Model: "Malibu",
    Color: "Yellow",
    Mileage: 15,
    MPGHwy: 38.2,
    MPGCity: 29.9,
    Year: 2020
};

[newCar] = await ctx.insert(newCar);
console.log(newCar.Id); // prints '1000'
newCar.MPGCity = 30.1;

// update by Primary Key, if one exists on object and table.
let n = await ctx.update(newCar);

console.assert(n > 0); // should pass
```

Updating a row explicitly using a `WHERE` clause.

```ts
// update by WHERE clause and callback using a proxy set intercept.
n = await ctx
    .where(m => m.Id.equals(1000))
    .update(m => {
        m.MPGCity = 30.3;
    });

console.assert(n > 0);

// alternatively and similarly, an object can be returned from the callback. 
// NOTE: (if both are specified, then the returned object takes precedence)
n = await ctx
    .where(m => m.Id.equals(1000))
    .update(m => ({
        MPGCity: 30.3
    }));

console.assert(n > 0);
```

## Delete

Deleting a row implicitly when a primary key is already defined in the record being deleted.

```ts
import { MyORMContext } from '@myorm/myorm';
import { adapter, createMySql2Pool } from '@myorm/mysql-adapter';

const pool = createMySql2Pool({ 
    database: "vehicles",
    host: "localhost", 
    user: "root",
    password: "root" 
});
const ctx: MyORMContext<Car> = new MyORMContext(adapter(pool), "Car");

newCar = {
    Make: "Chevy",
    Model: "Malibu",
    Color: "Yellow",
    Mileage: 15,
    MPGHwy: 38.2,
    MPGCity: 29.9,
    Year: 2020
};

[newCar] = await ctx.insert(newCar);

// delete by Primary Key, if one exists on object and table.
let n = await ctx.delete(newCar);

console.assert(n > 0);
```

Deleting a row explicitly using a `WHERE` clause.

```ts
// delete by WHERE clause.
let n = await ctx
    .where(m => m.Id.equals(1000))
    .delete();

console.assert(n > 0);
```

## Other

Saving a state of a context as a view-like variable context.

```ts
import { MyORMContext } from '@myorm/myorm';
import { adapter, createMySql2Pool } from '@myorm/mysql-adapter';

const pool = createMySql2Pool({ 
    database: "vehicles",
    host: "localhost", 
    user: "root",
    password: "root" 
});
const ctx: MyORMContext<Car> = new MyORMContext(adapter(pool), "Car");

// duplicate context, that has no effect on `ctx`, but is in a state with a `WHERE` clause being applied to always filter for the `Make` column being equal to "Ford" 
const fords = ctx.where(m => m.Make.equals("Ford"));

const fordsWithMoreThan10kMileage = await fords.where(m => m.Mileage.greaterThan(10000)).select();
const fordsWithLessThan10kMileage = await fords.where(m => m.Mileage.lessThan(10000)).select();
```

Programmatic defaults of columns when their key does not exist in their javascript object being inserted. 

```ts
import { MyORMContext } from '@myorm/myorm';
import { adapter, createMySql2Pool } from '@myorm/mysql-adapter';

const pool = createMySql2Pool({ 
    database: "vehicles",
    host: "localhost", 
    user: "root",
    password: "root" 
});
const ctx: MyORMContext<Car> = new MyORMContext(adapter(pool), "Car");

// upon insertion, a proxy will detect if the property already exists on `m`, if so, then the value will not be set.
// Otherwise, the set variables in the callback will be defaulted to the property.
ctx.default(m => {
    m.Mileage = 0;
    m.MPGCity = 25;
    m.MPGHwy = 35;
    m.Year = 2023;
});

let newCar = {
    Make: "Chevy",
    Model: "Malibu",
    Color: "Yellow",
};

let usedCar = { 
    Make: "Toyota", 
    Model: "Tacoma", 
    Color: "Grey", 
    Mileage: 32000, 
    Year: 2021 
};

const [chevyMalibu, toyotaTacoma] = await ctx.insert([newCar, usedCar]);

console.assert(chevyMalibu.Color === "Yellow" && chevyMalibu.Mileage === 0 && chevyMalibu.MPGCity === 25 && chevyMalibu.MPGHwy === 35 && chevyMalibu.Year === 2023);

console.assert(toyotaTacoma.Color === "Grey" && toyotaTacoma.Mileage === 32000 && toyotaTacoma.MPGCity === 25 && toyotaTacoma.MPGHwy === 35 && toyotaTacoma.Year === 2021);
```

## Adapters

Below is a list of `MyORM` supported adapters

### MySQL

Connect `MyORM` to your MySQL database.  

[MySQL Adapter](https://www.npmjs.com/package/@myorm/mysql-adapter)  

### MSSQL (Microsoft SQL)

__work in progress__

Connect `MyORM` to your MSSQL database.  

[MSSQL Adapter](https://www.npmjs.com/package/@myorm/mssql-adapter) 

### SQLite

__work in progress__

Connect `MyORM` to a SQLite file database.  

[SQLite Adapter](https://www.npmjs.com/package/@myorm/sqlite-adapter)  

### POSTgres

__work in progress__

Connect `MyORM` to a POSTgres database.  

[POSTgres Adapter](https://www.npmjs.com/package/@myorm/postgres-adapter)  

## Plugins and other supported material

Below is a list of supported plugins that can be used with various applications.

### GraphQL

__work in progress__

Generate Root Query and Mutation types through `MyORM` for instant use in your GraphQL API.

[GraphQL Plugin](https://www.npmjs.com/package/@myorm/graphql-plugin)  

### Lucia-Auth

__work in progress__

Connect [Lucia](https://lucia-auth.com/) to your application using `MyORM` and the custom adapter for `MyORM`.

[Lucia Auth Adapter](https://www.npmjs.com/package/@myorm/lucia-auth-plugin)  
