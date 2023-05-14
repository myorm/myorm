# MyORM Contributing Guide

This guide serves as directions for present and future contributors for all coding styles and expectations of new features, bug fixes, and small changes for `MyORM`.

## Preparing

This library only consists of one package, but other packages are used to enhance the user-experience, such as adapters, plugins, and extensions.  

Checkout and initialize the package

```
git clone https://github.com/myorm/myorm.git
cd myorm
npm install
```

Create a docker container for testing purposes.  

```bash
cd .github/chinook-setup
# windows
./start-chinook.sh
# linux
sh start-chinook.sh
```

An image will be built named `chinook_example_image` as well as a container named `chinook-example-db`.  

You can connect to this container in `MySQL Workbench` by connecting to `localhost:3306` under the username and password, `root` and `root`, respectively.

__This container will run on 3306, if you wish to change the port, go into the `start-chinook-file` and change `3306:3306` to `{yourPortNumber}:3306`.__  

## Testing

Testing to pass is required in order for a pull request to be approved.  
All of the tests are set up and will be updated accordingly, if a test needs to be added or modified, then you must make a pull request labeled `TESTS: {...}`.  

To run the default tests for a pull request to pass, run the following command.

```bash
npm run test
```

In the case where you may want to run your own tests while developing, you may copy the template, `lib/tests/custom_test_example.js` and name it as `custom_test.js` in the `lib/tests` directory, where you can do all of your own tests.  

To run your custom test, run the following command.

```bash
npm run test --custom
# or
npm run test -c
# or
npm run ctest
```

## Styling

Although, the library is fairly small, the styles and conventions are important for present and future development, follow this guide if you need directions to how something should be styled.  

### Syntax

Opening parentheses, square brackets, or curly braces should begin on the same line.

e.g.,

```js
const x = [
    "foo",
    "bar"
];

const o = {
    a: 1
};

function foo() {

}
```

Lambda functions should start on the same line.  

e.g.,

```js
const myLambda = () => {

}

```

All lambda functions with one parameter should __NOT__ be wrapped with a parentheses.

e.g.,

```js
const myLambdaInLine = a => a.toString();
```

### Indentation and Spacing

All functions should have one empty line in between eachother.  

e.g.,

```js
function a() {

}

function b() {

}
```

Chained function calls should start on the next line, indented in to match the nest of the call.

e.g.,

```js
myObject.a()
    .b()
    .c(m => m.d()
        .e());
```

### Naming

All private or protected variables and functions should be prepended with an underscore (`_`).

e.g.,

```js
class MyClass {
    _myPrivateVariable;

    constructor() {

    }

    _myPrivateFunction() {

    }
}
```

### Typing

All custom types should be defined as JSDOC types in `lib/src/types.js` 

### Description

__Public-facing functions/variables/parameters are considered public if they are exported or they are NOT marked `@private` or `@protected`__

Descriptions of all public facing functions and types should be in a "Capability" manner; As in-- describe the function or type in a first-person perspective saying what the function does.

Descriptions of all private facing functions and types should be in a "Utility" manner; As in-- describe the function or type in a third-person perspective saying what the end-user can do to use the function.

Descriptions of parameters or properties should be described as itself and what it is meant to do.  

Any references of types, type parameters, or parameters should be wrapped with a backtick (\`).  

All descriptions of type parameters, parameters, or return types should be on the next line.  

When referencing other functions in a class, wrap the name in an inline code block in the format of `.myOtherFunction()`, if the function exists on another object that isn't that class, then format it like: `<Adapter>` for the adapter or `<WhereBuilder>` for the `WhereBuilder` class, or something similar for anything else.

e.g.,

```js
/**
 * Use this function to divide `param` by 2.
 * @param {number} param 
 * The number to get the half of.
 * @returns {number} 
 * The new halved `param`.
 */
function half(param) {
    return param / 2;
}

/**
 * Multiplies `param` by 2 and returns the product.
 * @param {number} param
 * The number to get the double of.
 * @returns {number}
 * The new doubled `param`.
 */
export function double(param) {
    return 2 * param;
}
```