//@ts-check

import { MyORMContext } from "../src/contexts.js";

const pool = MyORMContext.createPool({ host: "192.168.1.9", port: 10500, database: "chinook", user: "root", password: "root" });

/** @type {MyORMContext<import("../../.github/chinook-setup/chinook-types.js").Track>} */
const trackCtx = new MyORMContext(pool, "Track");

/** @type {MyORMContext<import("../../.github/chinook-setup/chinook-types.js").Customer>} */
const customerCtx = new MyORMContext(pool, "Customer");

/** @type {MyORMContext<import("../../.github/chinook-setup/chinook-types.js").TestTable>} */
const testTableCtx = new MyORMContext(pool, "TestTable", undefined, { allowTruncation: true });

/** @type {MyORMContext<import("../../.github/chinook-setup/chinook-types.js").TestTable & { Id?: number }>} */
const testTableIdentCtx = new MyORMContext(pool, "TestTableIdentity", "Id", { allowTruncation: true });

/** @type {import("../src/toolbelt.js").SuccessHandler} */
function onSuccess({ schema, host, cmdRaw, cmdSanitized }) {
    if(printSuccesses) {
        console.log("Command executed: ", cmdRaw);
    }
}

/** @type {import("../src/toolbelt.js").FailHandler} */
function onFail({ schema, host, cmdRaw, cmdSanitized }) {
    if (printFails) {
        console.log("Command failed: ", cmdRaw);
    }
}

trackCtx.onSuccess(onSuccess);
trackCtx.onFail(onFail);
customerCtx.onSuccess(onSuccess);
customerCtx.onFail(onFail);
testTableCtx.onSuccess(onSuccess);
testTableCtx.onFail(onFail);
testTableIdentCtx.onSuccess(onSuccess);
testTableIdentCtx.onFail(onFail);

trackCtx.hasOne(m => m.Album.with("AlbumId").to("AlbumId"));
trackCtx.hasOne(m => m.Artist.with("Composer").to("Name"));
trackCtx.hasOne(m => m.Genre.with("GenreId").to("GenreId"));
trackCtx.hasOne(m => m.MediaType.with("MediaTypeId").to("MediaTypeId"));

const tests = [
    test1,
    test2,
    test3,
    test4,
    test5,
    test6,
    test7,
    test8,
    test9,
    test10,
    test11,
    test12,
    test13,
    test14,
    test15,
    test16,
    test17,
    test18,
    test19,
    test20,
    test21,
    test22,
    test23,
    test24,
    test25,
    test26,
]


async function test(testNumber, callback) {
    try {
        await callback(testNumber);
    } catch(e) {
        if(e instanceof TestError) {
            throw e;
        } else {
            console.error(`!!!!!!!!!! Test ${testNumber} failed due to internal Error: ${e.message} (To see more details, set "verbose" to true) !!!!!!!!!!`);
            if(verbose) {
                throw e;
            }
        }
    }
}

function assert(testNumber, cond) {
    if(cond) {
        console.log(`Test ${testNumber} passed.`);
    } else {
        if(verbose) {
            throw Error(`!!!!!!!!!! Test ${testNumber} failed. !!!!!!!!!!`);
        } else {
            console.error(`!!!!!!!!!! Test ${testNumber} failed. !!!!!!!!!! (To see more details, set "verbose" to true)`);
        }
    }
}

// SELECT

async function test1(testNumber) {
    console.log(`Testing SELECT * FROM Track`);
    const ts = await trackCtx.select();
    assert(testNumber, ts.length == 3503);
}

async function test2(testNumber) {
    console.log(`Testing SELECT * FROM Track WHERE Composer = 'AC/DC'`);
    const ts = await trackCtx
        .where(m => m.Composer.eq("AC/DC"))
        .select();
    
    for(let i = 15; i < 23; ++i) {
        assert(`${testNumber}_${(i-15)}`, ts[i - 15].TrackId == i);
    }
}

async function test3(testNumber) {
    console.log(`Testing SELECT * FROM Track WHERE Composer = 'AC/DC/' AND Name = 'Dog Eat Dog'`);
    const ts = await trackCtx
        .where(m => m.Composer.eq("AC/DC")
            .and(m => m.Name.eq("Dog Eat Dog")))
        .select();
    assert(testNumber, ts[0].TrackId == 16)
}

async function test4(testNumber) {
    console.log(`Testing SELECT * FROM Track WHERE Composer = 'AC/DC' OR Composer = 'Jerry Cantrell'`);
    const ts = await trackCtx
        .where(m => m.Composer.eq("AC/DC")
            .or(m => m.Composer.eq("Jerry Cantrell")))
        .select();

    // part 1
    for (let i = 15; i < 23; ++i) {
        assert(`${testNumber}_${(i - 15)}`, ts[i - 15].TrackId == i);
    }
    // part 2
    const jerryCantrellTrackIds = [51, 53, 54, 58, 59, 61];
    for (let i = 0; i < jerryCantrellTrackIds.length; ++i) {
        assert(`${testNumber}_${(i + 8)}`, ts[i+8].TrackId == jerryCantrellTrackIds[i]);
    }
}

async function test5(testNumber) {
    console.log(`Testing SELECT * FROM Track WHERE Composer = 'AC/DC' OR Name = 'Go Down' AND Name = 'Dog Eat Dog'`);
    const ts = await trackCtx
        .where(m => m.Composer.eq("AC/DC")
            .or(m => m.Name.eq("Go Down"))
            .and(m => m.Name.eq("Dog Eat Dog")))
        .select();
    assert(testNumber, ts[0].TrackId == 15 && ts[1].TrackId == 16);
}

async function test6(testNumber) {
    console.log(`Testing SELECT * FROM Track WHERE Composer = 'AC/DC' AND (Name = 'Dog Eat Dog' OR (Name LIKE '%go%' AND Name LIKE '%down%'))`);
    const ts = await trackCtx
        .where(m => m.Composer.eq("AC/DC")
            .and(m => m.Name.eq("Dog Eat Dog")
                .or(m => m.Name.contains("go")
                    .and(m => m.Name.contains("down"))
                    .and(m => m.Bytes.lessThan(2 ** 53))))
            .and(m => m.AlbumId.eq(4)))
        .select();
    assert(testNumber, ts[0].TrackId == 15 && ts[1].TrackId == 16);
}

async function test7(testNumber) {
    console.log(`Testing SELECT * FROM Track WHERE Composer = 'AC/DC' AND Bytes > 12066293`);
    let ts = await trackCtx
        .where(m => m.Composer.eq("AC/DC")
            .and(m => m.Bytes.gt(12066293)))
        .select();
    assert(`${testNumber}_0`, ts[0].Name == "Overdose");

    console.log(`Testing SELECT * FROM Track WHERE Composer = 'AC/DC' AND Bytes > 12066294`);
    ts = await trackCtx
        .where(m => m.Composer.eq("AC/DC")
            .and(m => m.Bytes.gt(12066294)))
        .select();
    assert(`${testNumber}_1`, ts.length == 0);
}

async function test8(testNumber) {
    console.log(`Testing SELECT * FROM Track WHERE Composer = 'AC/DC' AND Bytes >= 12066293`);
    let ts = await trackCtx
        .where(m => m.Composer.eq("AC/DC")
            .and(m => m.Bytes.gteq(12066293)))
        .select();
    assert(`${testNumber}_0`, ts[0].Name == "Overdose");

    console.log(`Testing SELECT * FROM Track WHERE Composer = 'AC/DC' AND Bytes >= 12066294`);
    ts = await trackCtx
        .where(m => m.Composer.eq("AC/DC")
            .and(m => m.Bytes.gteq(12066294)))
        .select();
    assert(`${testNumber}_1`, ts.length == 1);
}

async function test9(testNumber) {
    console.log(`Testing SELECT * FROM Track WHERE Composer = 'AC/DC' AND Bytes < 7032163`);
    let ts = await trackCtx
        .where(m => m.Composer.eq("AC/DC")
            .and(m => m.Bytes.lt(7032163)))
        .select();
    assert(`${testNumber}_0`, ts[0].Name == "Dog Eat Dog");

    console.log(`Testing SELECT * FROM Track WHERE Composer = 'AC/DC' AND Bytes < 7032162`);
    ts = await trackCtx
        .where(m => m.Composer.eq("AC/DC")
            .and(m => m.Bytes.lt(7032162)))
        .select();
    assert(`${testNumber}_1`, ts.length == 0);
}

async function test10(testNumber) {
    console.log(`Testing SELECT * FROM Track WHERE Composer = 'AC/DC' AND Bytes <= 7032163`);
    let ts = await trackCtx
        .where(m => m.Composer.eq("AC/DC")
            .and(m => m.Bytes.lteq(7032163)))
        .select();
    assert(`${testNumber}_0`, ts[0].Name == "Dog Eat Dog");

    console.log(`Testing SELECT * FROM Track WHERE Composer = 'AC/DC' AND Bytes <= 7032162`);
    ts = await trackCtx
        .where(m => m.Composer.eq("AC/DC")
            .and(m => m.Bytes.lteq(7032162)))
        .select();
    assert(`${testNumber}_1`, ts.length == 1);
}

async function test11(testNumber) {
    console.log(`Testing SELECT * FROM Track WHERE Composer <> 'AC/DC'`);
    let ts = await trackCtx
        .where(m => m.Composer.neq("AC/DC"))
        .select();
    assert(testNumber, ts.length == 2517);
}

async function test12(testNumber) {
    console.log(`Testing SELECT * FROM Track WHERE Composer LIKE '%dc'`);
    let ts = await trackCtx
        .where(m => m.Composer.like("%dc"))
        .select();
    assert(testNumber, ts.length == 8);
}

async function test13(testNumber) {
    console.log(`Testing SELECT * FROM Track WHERE Composer LIKE '%ac%'`);
    let ts = await trackCtx
        .where(m => m.Composer.contains("ac"))
        .select();
    assert(testNumber, ts.length == 93);
}

async function test14(testNumber) {
    console.log(`Testing SELECT * FROM Track LIMIT 1`);
    const ts = await trackCtx
        .take(1)
        .select();

    assert(testNumber, ts.length == 1);
}

async function test15(testNumber) {
    console.log(`Testing SELECT * FROM Track LIMIT 1 OFFSET 1`);
    const ts = await trackCtx
        .take(1)
        .skip(1)
        .select();

    assert(testNumber, ts[0].TrackId == 2);
}

async function test16(testNumber) {
    console.log(`Testing SELECT Track.TrackId AS trackId FROM Track LIMIT 10`);
    const ts = await trackCtx
        .take(10)
        .alias(m => ({
            trackId: m.TrackId
        }))
        .select();
    for(let i = 0; i < ts.length; ++i) {
        assert(`${testNumber}_${i}`, "trackId" in ts[i]);
    }
}

async function test17(testNumber) {
    console.log(`Testing SELECT Composer, COUNT(*), MAX(Bytes), MIN(Bytes), AVG(Bytes), AVG(UnitPrice), SUM(UnitPrice) FROM Track GROUP BY Composer`);
    const ts = await trackCtx
        .take(5)
        .groupBy((m, a) => ({
            Composer: m.Composer,
            Count: a.count(),
            MinBytes: a.min(m => m.Bytes),
            MaxBytes: a.max(m => m.Bytes),
            AvgBytes: a.avg(m => m.Bytes),
            AvgUnitPrice: a.avg(m => m.UnitPrice),
            SumUnitPrice: a.sum(m => m.UnitPrice)
        }))
        .select();
    assert(`${testNumber}_0`, (
        ts[0].Count == 10
        && ts[0].MinBytes == 6566314
        && ts[0].MaxBytes == 11170334
        && ts[0].AvgBytes == 7827041.4000
        && ts[0].AvgUnitPrice == 0.990000
        && ts[0].SumUnitPrice == 9.90
    ));
    assert(`${testNumber}_1`, (
        ts[1].Count == 978
        && ts[1].MinBytes == 161266
        && ts[1].MaxBytes == 1059546140
        && ts[1].AvgBytes == 97897024.0020
        && ts[1].AvgUnitPrice == 1.207791
        && ts[1].SumUnitPrice == 1181.22
    ));
    assert(`${testNumber}_2`, (
        ts[2].Count == 1
        && ts[2].MinBytes == 3990994
        && ts[2].MaxBytes == 3990994
        && ts[2].AvgBytes == 3990994.0000
        && ts[2].AvgUnitPrice == 0.990000
        && ts[2].SumUnitPrice == 0.99
    ));
    assert(`${testNumber}_3`, (
        ts[3].Count == 1
        && ts[3].MinBytes == 4331779
        && ts[3].MaxBytes == 4331779
        && ts[3].AvgBytes == 4331779.0000
        && ts[3].AvgUnitPrice == 0.990000
        && ts[3].SumUnitPrice == 0.99
    ));
    assert(`${testNumber}_4`, (
        ts[4].Count == 1
        && ts[4].MinBytes == 6290521
        && ts[4].MaxBytes == 6290521
        && ts[4].AvgBytes == 6290521.0000
        && ts[4].AvgUnitPrice == 0.990000
        && ts[4].SumUnitPrice == 0.99
    ));
}

async function test18(testNumber) {
    console.log(`Testing SELECT * FROM Track ORDER BY Bytes`);
    const ts = await trackCtx
        .sortBy(m => m.Bytes)
        .take(10)
        .select();
    let last = 0;
    for(let i = 0; i < ts.length; ++i) {
        assert(`${testNumber}_${i}`, ts[i].Bytes >= last);
        last = ts[i].Bytes;
    }
}

async function test19(testNumber) {
    console.log(`Testing SELECT * FROM Track ORDER BY Bytes ASC`);
    const ts = await trackCtx
        .sortBy(m => m.Bytes.asc())
        .take(10)
        .select();
    let last = 0;
    for (let i = 0; i < ts.length; ++i) {
        assert(`${testNumber}_${i}`, ts[i].Bytes >= last);
        last = ts[i].Bytes;
    }
}

async function test20(testNumber) {
    console.log(`Testing SELECT * FROM Track ORDER BY Bytes DESC`);
    const ts = await trackCtx
        .sortBy(m => m.Bytes.desc())
        .take(10)
        .select();
    let last = 2 ** 53;
    for (let i = 0; i < ts.length; ++i) {
        assert(`${testNumber}_${i}`, ts[i].Bytes <= last);
        last = ts[i].Bytes;
    }
}

async function test21(testNumber) {
    console.log(`Testing SELECT * FROM Track ORDER BY Composer DESC, Bytes`);
    const ts = await trackCtx
        .sortBy(m => [m.Composer.desc(), m.Bytes.asc()])
        .take(10)
        .select();
    
    let lastComposer = String.fromCodePoint(0x10ffff);
    let last = 2 ** 53;
    for (let i = 0; i < ts.length; ++i) {
        assert(`${testNumber}_${i}`, ts[i].Composer < lastComposer || ts[i].Bytes <= last);
        last = ts[i].Bytes;
    }
}

// INSERT TEST FUNCTIONS

async function test22(testNumber) {
    console.log(`Testing INSERT INTO TestTable (BigIntCol, BoolCol, DateCol, DateTimeCol, NumberCol, StringCol) VALUES (1, TRUE, NOW, NOW+10minutes, 2, 'test 22')`);
    const dateNow = new Date;
    const dateIn10Mins = new Date();
    dateIn10Mins.setMinutes(dateIn10Mins.getMinutes() + 10);
    const t = await testTableCtx.insertOne({
        BigIntCol: 1,
        BoolCol: true,
        DateCol: dateNow,
        DateTimeCol: dateIn10Mins,
        NumberCol: 2,
        StringCol: 'test 22'
    });
    assert(testNumber, (
        t.BigIntCol == 1
        && t.BoolCol
        && t.DateCol == dateNow
        && t.DateTimeCol == dateIn10Mins
        && t.NumberCol == 2
        && t.StringCol == 'test 22'
    ));
}

async function test23(testNumber) {
    console.log(`Testing INSERT INTO TestTableIdentity (BigIntCol, BoolCol, DateCol, DateTimeCol, NumberCol, StringCol) VALUES (1, TRUE, NOW, NOW+10minutes, 2, 'test 23_0'), (2, FALSE, NOW, NOW+10minutes, 3, 'test 23_1')`);
    const dateNow = new Date;
    const dateIn10Mins = new Date();
    dateIn10Mins.setMinutes(dateIn10Mins.getMinutes() + 10);
    const ts = await testTableIdentCtx.insertMany([{
        BigIntCol: 1,
        BoolCol: true,
        DateCol: dateNow,
        DateTimeCol: dateIn10Mins,
        NumberCol: 2,
        StringCol: 'test 23_0'
    }, {
        BigIntCol: 2,
        BoolCol: false,
        DateCol: dateNow,
        DateTimeCol: dateIn10Mins,
        NumberCol: 3,
        StringCol: 'test 23_1'
    }]);
    for(let i = 0; i < ts.length; ++i) {
        const t = ts[i];
        assert(testNumber, (
            t.Id == (i+1)
            && t.BigIntCol == (1 + i)
            && t.BoolCol == (i % 2 == 0)
            && t.DateCol == dateNow
            && t.DateTimeCol == dateIn10Mins
            && t.NumberCol == (2 + i)
            && t.StringCol == 'test 23_' + i
        ));
    }
}

// UPDATE TEST FUNCTIONS

async function test24(testNumber) {
    console.log(`Testing UPDATE TestTableIdentity SET StringCol='test 24' WHERE BigIntCol=2`);
    const numRowsAffected = await testTableIdentCtx
        .where(m => m.BigIntCol.eq(2))
        .update({
            StringCol: 'test 24'
        });
    assert(testNumber, numRowsAffected == 1);
}

// DELETE TEST FUNCTIONS

async function test25(testNumber) {
    console.log(`Testing DELETE FROM TestTable WHERE BigIntCol > 0`);
    const numRowsAffected = await testTableCtx
        .where(m => m.BigIntCol.gt(0))
        .delete();
    assert(testNumber, numRowsAffected == 1);
}

// VIEW TEST FUNCTIONS

async function test26(testNumber) {
    console.log('Testing views');
    const vwACDC = trackCtx.where(m => m.Composer.eq("AC/DC"));
    const vwApocalyptica = trackCtx.where(m => m.Composer.eq("Apocalyptica"));
    const vwAllComposers = trackCtx.groupBy((m, a) => ({ 
        composer: m.Composer,
        byte: m.Bytes,
        coun: a.count()
    }));

    assert(`${testNumber}_0`, (await vwACDC.count()) == 8);
    assert(`${testNumber}_1`, (await vwACDC.count()) == 8);
    assert(`${testNumber}_2`, (await vwACDC.count()) == 3503);
    
    assert(`${testNumber}_3`, (await vwACDC.where(m => m.Bytes.lteq(10547154)).count()) == 4);
    assert(`${testNumber}_4`, (await vwApocalyptica.where(m => m.Bytes.lteq(11406431)).count()) == 5);
    assert(`${testNumber}_5`, (await vwAllComposers
        .where(m => m.Bytes.gt(10547154)
            .and(m => m.Composer.eq("AC/DC")
                .or(m => m.Composer.eq("Apocalyptica"))))
        .select()).length == 8);
}

/**
 * @template T
 * @typedef {Partial<T> & Pick<T, keyof {[K in keyof T as undefined extends T[K] ? never : K]}>} UndefToOptional
 */

// RUN TESTS

async function customTest() {
    await testTableCtx.truncate();
    await testTableIdentCtx.truncate();
    await customerCtx.where(m => m.CustomerId.eq(99999))
        .delete();
    await customerCtx
        .insertOne({
            CustomerId: 99999,
            FirstName: "test",
            LastName: "customer",
            Email: "testcustomer@test.com"
        });
    await customerCtx
        .alias(m => ({
            first: m.FirstName
        }))
        .where(m => m.CustomerId.eq(99999))
        .update({
            first: "test2"
        });
}

var verbose = false;
var printSuccesses = true;
var printFails = false;
async function runTests() {
    // reset testTableCtx and testTableIdentCtx so they pass tests.
    await testTableCtx.truncate();
    await testTableIdentCtx.truncate();

    for (let i = 0; i < tests.length; ++i) {
        await test(i+1, tests[i]);
    }
}

// runTests();
customTest();


class TestError extends Error {
    constructor(message) {
        super(message);
    }
}