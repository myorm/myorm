export interface Album {
    AlbumId: number;
    Title: string;
    ArtistId: number;
    // included
    Artist?: Artist;
};

export interface Artist {
    ArtistId: number;
    Name?: string;
};

export interface Customer {
    CustomerId: number;
    FirstName: string;
    LastName: string;
    Company?: string;
    Address?: string;
    City?: string;
    State?: string;
    Country?: string;
    PostalCode?: string;
    Phone?: string;
    Fax?: string;
    Email: string;
    SupportRepId?: number;
};

export interface Employee {
    EmployeeId: number;
    FirstName: string;
    LastName: string;
    Title?: string;
    ReportsTo?: string;
    BirthDate?: Date,
    HireDate?: Date,
    Address?: string,
    City?: string,
    State?: string,
    Country?: string,
    PostalCode?: string,
    Fax?: string;
    Email: string;
};

export interface Genre {
    GenreId: number;
    Name: string;
};

export interface Invoice {
    InvoiceId: number;
    CustomerId: number;
    BillingAddress: string;
    BillingCity: string;
    BillingState: string;
    BillingCountry: string;
    BillingPostalCode: string;
}

export interface InvoiceLine {
    InvoiceLineId: number;
    InvoiceId: number;
    TrackId: number;
    UnitPrice: number;
    Quantity: number;
}

export interface MediaType {
    MediaTypeId: number;
    Name: string;
}

export interface Playlist {
    PlaylistId: number;
    Name: string;
    // included
    PlaylistTracks: PlaylistTrack[];
}

export interface PlaylistTrack {
    PlaylistId: number;
    TrackId: number;
    // included
    Track: Track;
    Playlist: Playlist;
}

export interface Track {
    TrackId: number;
    Name: string;
    AlbumId: number;
    MediaTypeId: number;
    GenreId: number;
    Composer?: string;
    Milliseconds: number;
    Bytes: number;
    UnitPrice: number;
    // included
    Album?: Album;
    Artist?: Artist;
    Genre?: Genre;
    MediaType?: MediaType;
    PlaylistTrack?: PlaylistTrack;
}

export interface TestTable {
    StringCol: string;
    NumberCol?: number;
    BoolCol?: boolean;
    DateCol?: Date;
    DateTimeCol?: Date;
    BigIntCol?: number;
}