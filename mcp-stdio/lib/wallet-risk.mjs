export class WalletRiskValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "WalletRiskValidationError";
  }
}

export function validateWalletRiskInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WalletRiskValidationError("The request must be an object.");
  }
  if (typeof value.address !== "string" || !/^0x[0-9a-fA-F]{40}$/u.test(value.address)) {
    throw new WalletRiskValidationError("address must be a 20-byte EVM address.");
  }
  const address = value.address.toLowerCase();
  if (
    address === "0x0000000000000000000000000000000000000000" ||
    address === "0x000000000000000000000000000000000000dead"
  ) {
    throw new WalletRiskValidationError("address must not be a zero or burn address.");
  }
  return { address };
}
