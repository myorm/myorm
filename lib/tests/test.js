//@ts-check

import { MyORMContext } from "../src/index.js";
import { testDeletes } from "./deletes.js";
import { testInserts } from "./inserts.js";
import { testSelects } from "./queries.js";
import { testUpdates } from "./updates.js";
import { adapter, createMySql2Pool } from "../../../adapters/mysql-adapter/lib/src/adapter.js";
import { v4 } from "uuid";
// import { adapter, createMySql2Pool } from '../../../adapters/mysql-adapter/lib/src/adapter.js';

import { config } from 'dotenv';

config();
const dbCfg = { 
    database: process.env.MYORM_DB, 
    host: process.env.MYORM_HOST, 
    user: process.env.MYORM_USER, 
    password: process.env.MYORM_PASS, 
    port: parseInt(process.env.MYORM_PORT ?? "3306") 
};

const pool = createMySql2Pool(dbCfg);
const chinookAdapter = adapter(pool);

/** @type {MyORMContext<import("../../.github/chinook-setup/chinook-types.js").Track>} */
export const trackCtx = new MyORMContext(chinookAdapter, "Track");

/** @type {MyORMContext<import("../../.github/chinook-setup/chinook-types.js").Customer>} */
export const customerCtx = new MyORMContext(chinookAdapter, "Customer");

/** @type {MyORMContext<import("../../.github/chinook-setup/chinook-types.js").Playlist>} */
export const playlistsCtx = new MyORMContext(chinookAdapter, "Playlist");

/** @type {MyORMContext<import("../../.github/chinook-setup/chinook-types.js").TestTable>} */
export const testTableCtx = new MyORMContext(chinookAdapter, "TestTable", { allowTruncation: true });

/** @type {MyORMContext<import("../../.github/chinook-setup/chinook-types.js").TestTable & { Id?: number }>} */
export const testTableIdentCtx = new MyORMContext(chinookAdapter, "TestTableIdentity", { allowTruncation: true });

/**
 * @typedef {object} User
 * @prop {number=} Id
 * @prop {string} FirstName
 * @prop {string} LastName
 * @prop {UserRole[]=} UserRoles
 */

/**
 * @typedef {object} UserRole
 * @prop {number} UserId
 * @prop {number} RoleId
 * @prop {User=} User
 * @prop {Role=} Role
 */

/**
 * @typedef {object} Role
 * @prop {number=} Id
 * @prop {string} Title
 * @prop {string} Description
 */

/** @type {MyORMContext<User>} */
export const users = new MyORMContext(chinookAdapter, "User");
users.hasMany(m => m.UserRoles.fromTable("UserRole").withKeys("Id", "UserId").andThatHasOne(m => m.Role.withKeys("RoleId", "Id")));
users.identify(m => v4());
// trackCtx.hasOne(m => m.Album.withKeys("AlbumId", "AlbumId")
//         .andThatHasOne(m => m.Artist.withKeys("ArtistId", "ArtistId")))
//     .hasOne(m => m.Genre.withKeys("GenreId", "GenreId"))
//     .hasOne(m => m.MediaType.withKeys("MediaTypeId", "MediaTypeId"))
//     .hasOne(m => m.PlaylistTrack.withKeys("TrackId", "TrackId")
//         .andThatHasOne(m => m.Playlist.withKeys("PlaylistId", "PlaylistId")));

playlistsCtx
    .hasMany(m => m.PlaylistTracks.fromTable("PlaylistTrack").withKeys("PlaylistId", "PlaylistId")
        .andThatHasOne(m => m.Track.withKeys("TrackId", "TrackId")
            .andThatHasOne(m => m.Album.withKeys("AlbumId", "AlbumId")
                .andThatHasOne(m => m.Artist.withKeys("ArtistId", "ArtistId")))
            .andThatHasOne(m => m.Genre.withKeys("GenreId", "GenreId"))
            .andThatHasOne(m => m.MediaType.withKeys("MediaTypeId", "MediaTypeId"))));

// trackCtx.onSuccess(onSuccess);
// trackCtx.onFail(onFail);
// customerCtx.onSuccess(onSuccess);
// customerCtx.onFail(onFail);
// playlistsCtx.onSuccess(onSuccess);
// playlistsCtx.onFail(onFail);

// testTableCtx.onSuccess(onSuccess);
// testTableCtx.onFail(onFail);
// testTableIdentCtx.onSuccess(onSuccess);
// testTableIdentCtx.onFail(onFail);

const printSuccesses = true;
const printFails = true;

new Promise(async () => {
    if (process.argv.length > 2) {
        if (process.argv.includes("--custom") || process.argv.includes("-C")) {
            const { test } = await import('./custom_test.js');
            await test();
        } else {
            await doTests();
        }
    } else {
        await doTests();
    }
    
    process.exit();
});


/** type {import("../src/index.js").SuccessHandler} */
function onSuccess({ cmdRaw, cmdSanitized, resultsInSqlRowFormat }) {
    if(printSuccesses) {
        console.log(cmdRaw);
        console.log(cmdSanitized);
    }
}

/** type {import("../src/index.js").FailHandler} */
function onFail({ cmdRaw, cmdSanitized }) {
    if (printFails) {
        console.log("Command failed: ", cmdRaw);
    }
}

async function doTests() {
    await testTableCtx.truncate();
    await testTableIdentCtx.truncate();
    await testSelects();
    await testInserts();
    await testUpdates();
    await testDeletes();
}
