import { isValidISBN } from "./isbn";
import { lookupBook } from "./book";
import { getList, addBook, removeBook } from "./storage";
import { startScanner, stopScanner } from "../scanner";

const form = document.querySelector("#isbn-form");
const input = document.querySelector("#isbn-input");
const status1 = document.querySelector("#status");
const list1 = document.querySelector("#list");
const scanBtn = document.querySelector("#scan-btn");
const video = document.querySelector("#preview");
let scanning = false;

function setStatus(msg) {
  status1.textContent = msg;
}

function render(list) {
  list1.innerHTML = "";
  for (const book of list) {
    const li = document.createElement("li");
    li.className = "book";
    li.innerHTML = `
      <img src="${book.cover}" alt="" width="50" />
      <div>
        <strong>${book.title}</strong><br />
        <small>${book.authors.join(", ")} ${book.year ? ". " + book.year : ""}</small>
      </div>
      <button data-isbn="${book.isbn}"> Remove</button>
    `;
    list1.appendChild(li);
  }
}

export async function handleISBN(raw) {
  if (!isValidISBN(raw)) {
    setStatus("That looks a bit off. Please check that this is a valid ISBN.");
    return;
  }
  setStatus("Looking up...");
  const book = await lookupBook(raw);
  if (!book) {
    setStatus("No book found with that ISBN.");
    return;
  }
  render(addBook(book));
  setStatus(`Added: ${book.title}`);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  handleISBN(input.value);
  inpput.value = "";
});

list1.addEventListener("click", (e) => {
  if (e.target.matches("button[data-isbn]")) {
    render(removeBook(e.target.dataset.isbn));
  }
});

render(getList());

scanBtn.addEventListener("click", async () => {
  if (scanning) {
    stopScanner(video);
    scanning = false;
    scanBtn.textContent = "Scan";
    return;
  }
  try {
    scanning = true;
    scanBtn.textContent = "Stop";
    await startScanner(video, (isbn) => {
      handleISBN(isbn);
      stopScanner(video);
      scanning = false;
      scanBtn.textContent = "Scan";
    });
  } catch (err) {
    setStatus("Camera unavailable: " + err.message);
    scanning = false;
    scanBtn.textContent = "Scan";
  }
});
