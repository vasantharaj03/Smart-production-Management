class AppError(Exception):
    def __init__(self, message="Request failed", status_code=400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)

class InvalidRequest(AppError):
    def __init__(self, message="Invalid request"): super().__init__(message, 400)
class Unauthorized(AppError):
    def __init__(self, message="Authentication required"): super().__init__(message, 401)
class Forbidden(AppError):
    def __init__(self, message="Forbidden"): super().__init__(message, 403)
class NotFound(AppError):
    def __init__(self, message="Resource not found"): super().__init__(message, 404)
class Conflict(AppError):
    def __init__(self, message="Resource already exists"): super().__init__(message, 409)
