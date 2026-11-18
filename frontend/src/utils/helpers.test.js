import { getErrorMessage } from "./helpers";

test("prefers a useful server-provided error message", () => {
  expect(getErrorMessage({ response: { data: { message: "Invalid product price" } } })).toBe("Invalid product price");
});

test("uses consistent messages for network, timeout, and server failures", () => {
  expect(getErrorMessage({ request: {} })).toBe("Unable to connect to the server. Check your connection and try again.");
  expect(getErrorMessage({ code: "ECONNABORTED" })).toBe("The request timed out. Please try again.");
  expect(getErrorMessage({ response: { status: 503, data: {} }, message: "Request failed with status code 503" })).toBe(
    "The server couldn't complete the request. Please try again.",
  );
});

test("falls back to ordinary error details or a generic message", () => {
  expect(getErrorMessage(new Error("Could not parse file"))).toBe("Could not parse file");
  expect(getErrorMessage(null)).toBe("Something went wrong. Please try again.");
});
