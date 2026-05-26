describe("config/db.js", () => {
  const OLD_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test("connects successfully and logs db_connected", async () => {
    jest.isolateModules(() => {
      const mongoose = require("mongoose");
      jest.spyOn(mongoose, "connect").mockResolvedValue();
      jest.doMock("../../../utils/logger", () => ({ info: jest.fn(), error: jest.fn() }));

      process.env.MONGO_URI = "mongodb://localhost:27017/test";
      process.env.TEST_MONGO_URI = "mongodb://localhost:27017/test";

      const connectDatabase = require("../../../config/db");
      expect(connectDatabase()).resolves.toBeUndefined();
    });
  });

  test("throws when both MONGO_URI and TEST_MONGO_URI are missing", async () => {
    jest.isolateModules(() => {
      delete process.env.MONGO_URI;
      delete process.env.TEST_MONGO_URI;
      jest.doMock("../../../utils/logger", () => ({ info: jest.fn(), error: jest.fn() }));

      const connectDatabase = require("../../../config/db");
      expect(connectDatabase()).rejects.toThrow("Missing MongoDB URI");
    });
  });

  test("logs error and re-throws when mongoose.connect fails", async () => {
    jest.isolateModules(() => {
      const mongoose = require("mongoose");
      jest.spyOn(mongoose, "connect").mockRejectedValue(new Error("Connection refused"));
      jest.doMock("../../../utils/logger", () => ({ info: jest.fn(), error: jest.fn() }));

      process.env.MONGO_URI = "mongodb://localhost:27017/test";
      process.env.TEST_MONGO_URI = "mongodb://localhost:27017/test";

      const connectDatabase = require("../../../config/db");
      expect(connectDatabase()).rejects.toThrow("Connection refused");
    });
  });
});