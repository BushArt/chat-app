const User = require("../../../models/User");

describe("User schema", () => {
  describe("field validations", () => {
    test("username is required", async () => {
      const user = new User({ password: "password123" });
      let err;
      try {
        await user.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.errors.username).toBeDefined();
      expect(err.errors.username.kind).toBe("required");
    });

    test("password is required", async () => {
      const user = new User({ username: "alice" });
      let err;
      try {
        await user.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.errors.password).toBeDefined();
      expect(err.errors.password.kind).toBe("required");
    });

    test("username is trimmed", () => {
      const user = new User({ username: "  alice  ", password: "password123" });
      expect(user.username).toBe("alice");
    });

    test("validates successfully with all required fields", async () => {
      const user = new User({ username: "alice", password: "password123" });
      let err;
      try {
        await user.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeUndefined();
    });
  });

  describe("schema options", () => {
    test("timestamps are enabled", () => {
      const user = new User({ username: "bob", password: "pass" });
      expect(user.schema.options.timestamps).toBe(true);
    });

    test("username has a unique index", () => {
      const user = new User({ username: "alice", password: "pass" });
      expect(user.schema.path("username").options.unique).toBe(true);
    });
  });
});