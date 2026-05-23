# Centralized Error Handling Plan

## Goal
Create a consistent, maintainable error handling strategy for both the Express HTTP API and the Socket.io real‑time layer. All errors should be represented by a structured JSON payload (or socket event) and logged via the existing `logger`.

## Components
1. **Custom Error Class** (`utils/HttpError.js`)
   ```js
   class HttpError extends Error {
     constructor(message, status = 500, code = 'internal_error') {
       super(message);
       this.status = status;
       this.code = code;
     }
   }
   module.exports = HttpError;
   ```
2. **Express Error‑Handling Middleware** (`middleware/errorHandler.js`)
   ```js
   const logger = require('../utils/logger');
   module.exports = (err, req, res, next) => {
     const status = err.status || 500;
     const code = err.code || 'internal_error';
     logger.error({ event: 'http_error', status, code, message: err.message, path: req.path });
     res.status(status).json({ error: err.message, code });
   };
   ```
3. **Socket Error Helper** (`utils/socketError.js`)
   ```js
   const logger = require('../utils/logger');
   function emitError(socket, event, err) {
     const payload = { error: err.message, code: err.code || 'internal_error' };
     logger.error({ event: 'socket_error', socketId: socket.id, err: err.message, code: payload.code });
     socket.emit(event, payload);
   }
   module.exports = emitError;
   ```

## Integration Steps
1. **Add Files** – create `utils/HttpError.js`, `middleware/errorHandler.js`, `utils/socketError.js`.
2. **Register Middleware** – in `app.js` after all route registrations:
   ```js
   const errorHandler = require('./middleware/errorHandler');
   app.use(errorHandler);
   ```
3. **Refactor Routes** – replace direct `res.status(...).json(...)` with:
   ```js
   const HttpError = require('../utils/HttpError');
   // Example
   if (!user) return next(new HttpError('User not found', 404, 'user_not_found'));
   ```
   Throwing the error also works (`throw new HttpError(...)`).
4. **Refactor Socket Handlers** – import `emitError` and replace raw `socket.emit('error_message', ...)` calls:
   ```js
   const emitError = require('../../utils/socketError');
   // Example inside a handler
   if (!valid) return emitError(socket, 'error_message', new HttpError('Invalid data', 400, 'invalid_data'));
   ```
5. **Update Tests** – adjust unit and integration tests to expect the new JSON error shape (`{ error, code }`) and socket error events.
6. **Documentation** – add a section to `README.md` describing the error format and how to create custom errors.

## Mermaid Diagram
```mermaid
flowchart TD
    A[Incoming Request] --> B[Route Handler]
    B -->|Success| C[Response]
    B -->|Error| D[Throw/next(HttpError)]
    D --> E[errorHandler Middleware]
    E --> F[Log via logger]
    E --> G[Send JSON {error, code}]
    
    subgraph Socket
        S[Socket Event] --> H[Socket Handler]
        H -->|Success| I[Emit success]
        H -->|Error| J[emitError Helper]
        J --> K[Log via logger]
        J --> L[Emit error event]
    end
```

## Timeline (high‑level)
| Phase | Tasks | Approx. Duration |
|------|-------|-----------------|
| **Setup** | Create files, add middleware registration | 1 day |
| **Refactor Routes** | Replace all direct error responses with `HttpError` usage | 2‑3 days |
| **Refactor Sockets** | Introduce `emitError` helper and update handlers | 2 days |
| **Testing** | Update/extend tests for new error format | 1‑2 days |
| **Docs** | Document error format in README | 0.5 day |

---

*All items are reflected in the updated todo list (`plans/error_handling_plan.md` has been created for reference).*