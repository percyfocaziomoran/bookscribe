const KEY = "reading-list";

export function getList() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? [];
  } catch {
    return [];
  }
}

function save(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function addBook(book) {
  const list = getList();
  if (list.some((b) => b.isbn === book.isbn)) return list;
  const updated = [{ ...book, addedAt: Date.now() }, ...list];
  save(updated);
  return updated;
}

export function removeBook(isbn) {
  const updated = getList().filter((b) => b.isbn !== isbn);
  save(updated);
  return updated;
}
