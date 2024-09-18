import { ethers } from "hardhat";

import { EntryPointSimulations } from "@ethers-v6";

export async function deployEntryPoint(): Promise<EntryPointSimulations> {
  const EntryPoint = await ethers.getContractFactory("EntryPointSimulations");
  return EntryPoint.deploy();
}
