const Message = require("../../../models/Message");

describe("Message schema", () => {
  const validMessage = {
    sender: "alice",
    message: "hello",
  };

  describe("field validations", () => {
    test("sender is required", async () => {
      const msg = new Message({ message: "hello" });
      let err;
      try {
        await msg.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.errors.sender).toBeDefined();
      expect(err.errors.sender.kind).toBe("required");
    });

    test("message is required", async () => {
      const msg = new Message({ sender: "alice" });
      let err;
      try {
        await msg.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.errors.message).toBeDefined();
      expect(err.errors.message.kind).toBe("required");
    });

    test("validates successfully with all required fields", async () => {
      const msg = new Message(validMessage);
      let err;
      try {
        await msg.validate();
      } catch (e) {
        err = e;
      }
      expect(err).toBeUndefined();
    });
  });

  describe("default values", () => {
    test("receiver defaults to null", () => {
      const msg = new Message(validMessage);
      expect(msg.receiver).toBeNull();
    });

    test("isGlobal defaults to false", () => {
      const msg = new Message(validMessage);
      expect(msg.isGlobal).toBe(false);
    });

    test("clientId defaults to null", () => {
      const msg = new Message(validMessage);
      expect(msg.clientId).toBeNull();
    });
  });

  describe("indexes", () => {
    test("has compound index on isGlobal + createdAt", () => {
      const msg = new Message(validMessage);
      const indexes = msg.schema.indexes();
      const hasGlobalIndex = indexes.some(
        ([fields]) => fields.isGlobal === 1 && fields.createdAt === 1
      );
      expect(hasGlobalIndex).toBe(true);
    });

    test("has compound index on sender + receiver + createdAt", () => {
      const msg = new Message(validMessage);
      const indexes = msg.schema.indexes();
      const hasDMIndex = indexes.some(
        ([fields]) => fields.sender === 1 && fields.receiver === 1 && fields.createdAt === 1
      );
      expect(hasDMIndex).toBe(true);
    });
  });
});