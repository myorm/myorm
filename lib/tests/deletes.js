//@ts-check

import { testTableCtx } from "./test.js";
import assert from "assert";

async function test1() {
    console.log("Testing [DELETE TestTable WHERE StringCol = 'Test 1']");
    const numRowsAffected = await testTableCtx
        .where(m => m.StringCol.equals("Test 1"))
        .delete();
    
    const recs = await testTableCtx
        .where(m => m.StringCol.equals("Test 1"))
        .select();
    assert(numRowsAffected == 1 && recs.length <= 0);
}

async function test2() {

}

async function test3() {

}

export async function testDeletes() {
    console.log(`Testing deletes...`);
    await test1();
    await test2();
    await test3();
    console.log(`Delete tests passed.`);
}