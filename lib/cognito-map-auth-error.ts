/** Maps Cognito SDK / IDP errors to short user-facing strings (web + shared tests). */
export function mapCognitoAuthError(error: unknown): string {
  const err = error as { name?: string };
  switch (err?.name) {
    case "NotAuthorizedException":
      return "Wrong email or password.";
    case "UserNotConfirmedException":
      return "Account created, but email is not confirmed yet.";
    case "UsernameExistsException":
      return "That email is already registered. Sign in instead.";
    case "InvalidPasswordException":
      return "Password does not meet Cognito policy requirements.";
    case "CodeMismatchException":
      return "Invalid verification code.";
    case "ExpiredCodeException":
      return "Verification code expired. Request a new code.";
    case "LimitExceededException":
    case "TooManyRequestsException":
      return "Too many attempts. Please wait and try again.";
    case "UserNotFoundException":
      return "No account found with that email.";
    default:
      return "Authentication failed.";
  }
}
