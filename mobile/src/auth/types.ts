export type CognitoSessionTokens = {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresAt: number;
};

export type CognitoUserProfile = {
  id: string;
  email?: string;
  name?: string;
};
