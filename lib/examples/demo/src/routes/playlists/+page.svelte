<script>
    import { goto } from '$app/navigation';

    export let data;
</script>

<table class="table table-hover table-striped">
    <thead>
        <th>Id</th>
        <th>Name</th>
    </thead>
    <tbody>
        {#each data.playlists as playlist}
            <tr on:click={() => goto(`/playlists/${playlist.PlaylistId}`)}>
                <td>{playlist.PlaylistId}</td>
                <td>{playlist.Name}</td>
            </tr>
        {/each}
    </tbody>
</table>