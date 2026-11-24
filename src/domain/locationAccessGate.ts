/**
 * Pure domain contract and verifier for the Location Database UI access code gate.
 * Contains zero UI or framework dependencies.
 */

export interface IAccessCodeVerifier {
  readonly codeLength: number;
  verify(input: string): boolean;
}

export class StaticAccessCodeVerifier implements IAccessCodeVerifier {
  public readonly codeLength: number;
  private readonly expectedCode: string;

  constructor(expectedCode: string) {
    this.expectedCode = expectedCode.trim();
    this.codeLength = this.expectedCode.length;
  }

  public verify(input: string): boolean {
    return input.trim() === this.expectedCode;
  }
}

export const LOCATION_DATABASE_ACCESS_CODE = '2006';

export const locationDatabaseCodeVerifier: IAccessCodeVerifier =
  new StaticAccessCodeVerifier(LOCATION_DATABASE_ACCESS_CODE);
