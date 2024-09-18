import { expect } from "chai";
import { ethers } from "hardhat";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { Reverter } from "@test-helpers";
import { deployAA, deployEntryPoint } from "@deployment";

import { EntryPointSimulations, SmartAccount, SmartAccountFactory } from "@ethers-v6";

describe("SmartAccount", () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let entryPoint: EntryPointSimulations;
  let accountFactory: SmartAccountFactory;

  let account: SmartAccount;

  before(async () => {
    [OWNER, SECOND] = await ethers.getSigners();

    entryPoint = await deployEntryPoint();
    accountFactory = await deployAA(entryPoint);

    await accountFactory.deploySmartAccount(OWNER.address);
    account = await ethers.getContractAt("SmartAccount", await accountFactory.getSmartAccount(OWNER.address));

    await reverter.snapshot();
  });

  afterEach(reverter.revert);
});
