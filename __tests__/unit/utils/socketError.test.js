// Mock logger
jest.mock("../../../utils/logger", () => ({
  error: jest.fn(),
}));

const emitError = require("../../../utils/socketError");

describe("socketError (emitError)", () => {
  let socket;

  beforeEach(() => {
    jest.clearAllMocks();
    socket = {
      id: "socket-123",
      emit: jest.fn(),
    };
  });

  test("emits event with error message and default code", () => {
    const err = new Error("Something went wrong");
    emitError(socket, "error_message", err);
    expect(socket.emit).toHaveBeenCalledWith("error_message", {
      error: "Something went wrong",
      code: "internal_error",
    });
  });

  test("emits event with custom error code", () => {
    const err = new Error("Not found");
    err.code = "resource_not_found";
    emitError(socket, "error_message", err);
    expect(socket.emit).toHaveBeenCalledWith("error_message", {
      error: "Not found",
      code: "resource_not_found",
    });
  });

  test("calls logger.error with socket id and error details", () => {
    const logger = require("../../../utils/logger");
    const err = new Error("Forbidden");
    err.code = "forbidden_access";
    emitError(socket, "error_message", err);
    expect(logger.error).toHaveBeenCalledWith({
      event: "socket_error",
      socketId: "socket-123",
      err: "Forbidden",
      code: "forbidden_access",
    });
  });

  test("works with HttpError instances", () => {
    const HttpError = require("../../../utils/HttpError");
    const err = new HttpError("Rate limited", 429, "rate_limited");
    emitError(socket, "custom_event", err);
    expect(socket.emit).toHaveBeenCalledWith("custom_event", {
      error: "Rate limited",
      code: "rate_limited",
    });
  });

  test("can emit on any event name", () => {
    const err = new Error("test");
    emitError(socket, "custom_error_event", err);
    expect(socket.emit).toHaveBeenCalledWith("custom_error_event", {
      error: "test",
      code: "internal_error",
    });
  });
});