import { ethers } from "hardhat";

import { EntryPoint } from "@ethers-v6";

export async function deployEntryPoint(): Promise<EntryPoint> {
  const EntryPoint = await ethers.getContractFactory("EntryPoint");
  return EntryPoint.deploy();
}
