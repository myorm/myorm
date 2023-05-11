//@ts-check
import { trackCtx } from "./test.js";
import assert from "assert";

async function test1() {
    console.log("Testing [SELECT * FROM Track]");
    const ts = await trackCtx.select();
    assert(ts.length == 3503);
}

async function test2() {
    console.log("Testing [SELECT COUNT(*) FROM Track]");
    const count = await trackCtx.count();
    assert(count == 3503);
}

async function test3() {
    console.log("Testing [SELECT * FROM Track WHERE Composer = 'AC/DC']");
    const acdcTracks = await trackCtx
        .where(m => m.Composer.equals("AC/DC"))
        .select();
    assert(acdcTracks.length == 8);
}

async function test4() {
    console.log("Testing [SELECT * FROM Track WHERE Composer = 'AC/DC' AND Bytes > 7032162]");
    const acdcTracks = await trackCtx
        .where(m => m.Composer.equals("AC/DC")
            .and(m => m.Bytes.greaterThan(7032162)))
        .select();
    assert(acdcTracks.length == 7);
}

async function test5() {
    console.log("Testing [SELECT * FROM Track WHERE Composer = 'AC/DC' AND (Bytes > 7032162 OR Milliseconds = 215196)]");
    const acdcTracks = await trackCtx
        .where(m => m.Composer.equals("AC/DC")
            .and(m => m.Bytes.greaterThan(7032162)
                .or(m => m.Milliseconds.equals(215196))))
        .select();
    assert(acdcTracks.length == 8);
}

async function test6() {
    console.log("Testing [SELECT * FROM Track WHERE Composer = 'AC/DC' ORDER BY Bytes DESC]");
    const acdcTracks = await trackCtx
        .where(m => m.Composer.equals("AC/DC"))
        .sortBy(m => m.Bytes.desc())
        .select();
    let last = 2 ** 53 - 1;
    for (const track of acdcTracks) {
        assert(track.Bytes <= last);
        last = track.Bytes;
    }
}

async function test7() {
    console.log("Testing [SELECT * FROM Track WHERE Composer = 'AC/DC' AND (Bytes > 7032162 OR Milliseconds = 215196) ORDER BY Bytes]");
    const acdcTracks = await trackCtx
        .where(m => m.Composer.equals("AC/DC")
            .and(m => m.Bytes.greaterThan(7032162)
                .or(m => m.Milliseconds.equals(215196))))
        .sortBy(m => m.Bytes)
        .select();
    let last = 0;
    for (const track of acdcTracks) {
        assert(track.Bytes >= last);
        last = track.Bytes;
    }
}

async function test8() {
    console.log("Testing [SELECT * FROM Track WHERE Composer <> NULL ORDER BY Composer DESC, Bytes ASC]");
    const acdcTracks = await trackCtx
        .where(m => m.Composer.notEquals(null))
        .sortBy(m => [m.Composer.descending(), m.Bytes.ascending()])
        .select();
    assert(acdcTracks[0].Composer == "Wright, Waters");
    assert(acdcTracks[1].Composer == "Wolfgang Amadeus Mozart" && acdcTracks[2].Composer == "Wolfgang Amadeus Mozart" && acdcTracks[1].Bytes < acdcTracks[2].Bytes);
}

async function test9() {
    console.log("Testing [SELECT Composer, COUNT(*), COUNT(DISTINCT AlbumId), AVG(Bytes), SUM(Bytes), MAX(Bytes), MIN(Bytes), SUM(Milliseconds) FROM Track GROUP BY Composer]");
    const aggregatedByComposer = await trackCtx
        .groupBy((m, { total, count, avg, min, max, sum, }) => [m.Composer, total(), count(m.AlbumId), avg(m.Bytes), sum(m.Bytes), max(m.Bytes), min(m.Bytes)])
        .select();
    console.log(aggregatedByComposer);
    assert( "Composer" in aggregatedByComposer[0]
        && "$total" in aggregatedByComposer[0]
        && "$count_AlbumId" in aggregatedByComposer[0]
        && "$avg_Bytes" in aggregatedByComposer[0]
        && "$sum_Bytes" in aggregatedByComposer[0]
        && "$max_Bytes" in aggregatedByComposer[0]
        && "$min_Bytes" in aggregatedByComposer[0]
        && aggregatedByComposer[0].Composer == null
        && aggregatedByComposer[0].$total == 978
        && aggregatedByComposer[0].$avg_Bytes == 97897024.0020);
    }

export async function testSelects() {
    console.log(`Testing selects...`);
    await test1();
    await test2();
    await test3();
    await test4();
    await test5();
    await test6();
    await test7();
    await test8();
    await test9();
    console.log(`Select tests passed.`);
}