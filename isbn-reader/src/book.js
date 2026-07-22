import { normaliseISBN } from "./isbn";

//returns book object, or null if not found
export async function lookupBook(rawIsbn) {
    const isbn = normaliseISBN(rawIsbn);
    const fromOpenLibrary = await tryOpenLibrary(isbn);
    if(fromOpenLibrary){
        return fromOpenLibrary;
    }
    return await tryGoogleBooks(isbn); //backup
}

async function tryOpenLibrary(isbn) {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}` +
    `&format=json&jscmd=data`;
    const res = await fetch(url);
    if (!res.ok){
        return null;
    }
    const data = await res.json();
    const record = data[`ISBN:${isbn}`];
    if(!record){
        return null;
    }

    return{
        isbn;
        title: record.title ?? "Unknown title",
        authors: (record.authors ?? []).map((a) => a.name),
        cover:
            record.cover?.medium ??      `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`,
        year: record.publish_date ?? "",
        source: "openlibrary",
    };
}

async function tryGoogleBooks(isbn){
    const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
    const res = await fetch(url);
    if(!res.ok){
        return null;
    }
    const data = await res.json();
    const info = data.items?.[0]?.volumeInfo;
    if (!info){
        return null;
    }
    return {
        isbn,
        title: info.title ?? "Unknown title",
        authors: info.authors ?? [],
        cover: info.imageLinks?.thumbnail?.replace("http:", "https:") ?? "",
        year: info.publishedDate ?? "",
        source: "google",
  };
}