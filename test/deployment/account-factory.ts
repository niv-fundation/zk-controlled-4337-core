import { ethers } from "hardhat";

import { EntryPoint, SmartAccountFactory } from "@ethers-v6";

export async function deployAA(entryPoint: EntryPoint) {
  const SmartAccountFactory = await ethers.getContractFactory("SmartAccountFactory");
  let accountFactory: SmartAccountFactory = await SmartAccountFactory.deploy();

  const Proxy = await ethers.getContractFactory("ERC1967Proxy");
  let proxy = await Proxy.deploy(await accountFactory.getAddress(), "0x");

  accountFactory = await ethers.getContractAt("SmartAccountFactory", await proxy.getAddress());

  const SmartAccount = await ethers.getContractFactory("SmartAccount");

  const IdentityAuthVerifier = await ethers.getContractFactory("IdentityAuthVerifier");
  const identityAuthVerifier = await IdentityAuthVerifier.deploy();

  const account = await SmartAccount.deploy(await entryPoint.getAddress(), await identityAuthVerifier.getAddress());

  await accountFactory.__SmartAccountFactory_init(await account.getAddress());

  return accountFactory;
}
