# myorm

`MyORM` is an open-source type-safe ORM model intended to be used in a similar fashion to Microsoft's Entity Framework Core.

# Documentation

Below are a few brief non-descriptive examples of some of the features `MyORM` has to offer using the [mysql-adapter](#mysql).

If you'd like to read about all of the features and what `MyORM` has to offer, you can read more documentation [here](https://github.com/traviszuleger/mysql-contexts)

## Query

```ts
import { MyORMContext } from '@myorm/myorm';
import { adapter, createMySql2Pool } from '@myorm/mysql-adapter';

const pool = createMySql2Pool({ 
    database: "cars",
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

newCar = await ctx.insert(newCar);

console.log(newCar);

/** prints (results are not from a legitimate database)
 * {
 *   Id: 1000,
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

newCar = await ctx.insert(newCar);

newCar.MPGCity = 30.1;

// update by Primary Key, if one exists on object and table.
let n = await ctx.update(newCar);

if(n <= 0) {
    // update by WHERE clause.
    n = await ctx
        .where(m => m.Id.equals(1000))
        .updateSelect({
            MPGCity: 30.1
        });
}
console.assert(n > 0);
```

## Delete

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

newCar = await ctx.insert(newCar);

// delete by Primary Key, if one exists on object and table.
let n = await ctx.delete(newCar);

if(n <= 0) {
    // delete by WHERE clause.
    n = await ctx
        .where(m => m.Id.equals(1000))
        .deleteSelect();
}

console.assert(n > 0);
```


## Adapters

Below is a list of `MyORM` supported adapters

### MySQL

__work in progress__

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
