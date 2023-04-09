import { MySqlTableContext } from "../contexts";
import type { Customer, Artist, Employee, Playlist } from "./chinook-types";

const pool = MySqlTableContext.createPool({ host: "127.0.0.1", port: 10500, database: "chinook", user: "root", password: "root" });
const customerCtx = new MySqlTableContext<Customer>(pool, "Customer");
const employeeCtx = new MySqlTableContext<Employee>(pool, "Employee");

// Creating a Table Context for chinook.dbo.Customer, letting the constructor create the Connection Pool for us.
function exampleCreateContext() {
    const customerCtx = new MySqlTableContext<Customer>({ host: "127.0.0.1", port: 10500, database: "chinook", user: "root", password: "root" }, "Customer");
}

// Creating a Connection Pool to be used for multiple tables.
function exampleCreateConnectionPoolForManyContexts() {
    const pool = MySqlTableContext.createPool({ host: "127.0.0.1", port: 10500, database: "chinook", user: "root", password: "root" });
    const customerCtx = new MySqlTableContext<Customer>(pool, "Customer");
    const artistCtx = new MySqlTableContext<Artist>(pool, "Customer");
}

type CustomerWithAutoIncrementId = Customer & { Id?: number };

// Creating a Table Context for chinook.dbo.Customer, specifying that the Table has an Auto Increment column.
function exampleCreateContextWithIncKey() {
    const pool = MySqlTableContext.createPool({ host: "127.0.0.1", port: 10500, database: "chinook", user: "root", password: "root" });
    const customerCtx = new MySqlTableContext<CustomerWithAutoIncrementId>(pool, "Customer", "Id");
}

// Getting 5 records, with no offset.
function exampleGetN() {
    customerCtx.get(5, 0).then(customerGetHandler);
}

// Getting all records, no clauses.
function exampleGetAll() {
    customerCtx.getAll().then(customerGetHandler);
}

// Getting all Customers named "Frank Harris"
function exampleWhereBasic() {
    customerCtx.getAll(where => where.equals("FirstName", "Harris")).then(customerGetHandler);
}

// Getting all Customers with the first name, "Frank", and not the last name "Harris"
function exampleWhereNegating() {
    customerCtx.getAll(where => where.equals("FirstName", "Frank").not().andEquals("LastName", "Harris")).then(customerGetHandler);
}

// Getting all Customers that do not have the full name "Frank Harris"
function exampleWhereNegateEntire() {
    customerCtx.getAll(where => where.not(where => where.equals("FirstName", "Frank").andEquals("LastName", "Harris"))).then(customerGetHandler);
}

// Getting all Customers with the a full name of "Frank Harris" OR all Customers with the first name of "Frank" and a CustomerId of 16
function exampleWhereNested() {
    customerCtx.getAll(where => where.equals("FirstName", "Frank").andEquals("LastName", "Harris", where => where.orEquals("CustomerId", 16))).then(customerGetHandler);
}

// Getting all Customers ascending ordered by their CustomerId.
function exampleOrderBy() {
    customerCtx.getAll(null, order => order.by("CustomerId"));
}

// Inserting one Customer.
function exampleInsertOne() {
    const customerCtx = new MySqlTableContext<CustomerWithAutoIncrementId>(pool, "Customer", "Id");
    customerCtx.insertOne({
        CustomerId: 0,
        FirstName: '',
        LastName: '',
        Email: '',
    });
}

// Inserting two Customers.
function exampleInsertMany() {
    
}

function exampleUpdateOne() {

}

function exampleUpdateMany() {

}


// Used simply for cleaning up the examples.

function customerGetHandler(results: Customer[]) {
    console.log(results[0]);
}