//normalising isbn
export function normaliseISBN(input) {
  return input.replace(/[^0-9Xx]/g, "").toUpperCase();
}

//newer books are isbn 13
export function isValid13(isbn) {
  if (!/^\d{13}$/.test(isbn)) {
    return false;
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(isbn[12]);
}

//older books are isbn 10
export function isValid10(isbn) {
  if (!/^\d{9}$/.test(isbn)) {
    return false;
  }
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(isbn[i]) * (10 - i);
  }
  sum += isbn[9] === "X" ? 10 : Number(isbn[9]);
  return sum % 11 === 0;
}

//take the isbn, normalise, then see if valid
export function isValidISBN(input) {
  const isbn = normaliseISBN(input);
  return isValid13(isbn) || isValid10(isbn);
}
