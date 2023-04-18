<script>
    export let data;

    function sortBy(key) {

    }
</script>

<div class="container">
    <label class="form-label">Playlist ID<input class="form-control" disabled value={data.playlist.PlaylistId}></label>
    <label class="form-label">Playlist Name<input class="form-control" bind:value={data.playlist.Name}></label>
    
    <br>Tracks
    <table class="table table-hover table-striped">
        <thead>
            <th on:click={() => sortBy("TrackId")}>Id</th>
            <th on:click={() => sortBy("Name")}>Name</th>
            <th on:click={() => sortBy("Composer")}>Composer</th>
            <th on:click={() => sortBy("Milliseconds")}>Duration</th>
            <th on:click={() => sortBy("Bytes")}>Bytes</th>
            <th on:click={() => sortBy("Genre")}>Genre</th>
        </thead>
        <tbody>
            {#each data.playlist.PlaylistTracks as pTrack}
                <tr>
                    <td>{pTrack.Track.TrackId}</td>
                    <td>{pTrack.Track.Name}</td>
                    <td>{pTrack.Track.Composer ?? "UNKNOWN"}</td>
                    <td>{Math.floor((pTrack.Track.Milliseconds / 1000) / 60)}:{Math.floor((pTrack.Track.Milliseconds / 1000) % 60).toString().padStart(2, '0')}</td>
                    <td>{(pTrack.Track.Bytes / 1024 / 1024).toFixed(2)}Mb</td>
                    <td>{pTrack.Track.Genre?.Name}</td>
                </tr>
            {/each}
        </tbody>
    </table>
</div>

<style>
    tr {
        cursor: pointer;
    }
    td, th {
        text-align: center;
    }
</style>