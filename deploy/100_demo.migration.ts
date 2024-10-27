import { ethers } from "hardhat";
import { Deployer } from "@solarity/hardhat-migrate";

import {
  EntryPoint__factory,
  ERC20Mock__factory,
  SmartAccount__factory,
  SmartAccountFactory__factory,
} from "@ethers-v6";

import {
  getEmptyPackedUserOperation,
  getInitCode,
  getSignedPackedUserOperation,
  sendSignedPackedUserOperation,
} from "@/test/helpers/aa-helper";
import { buildNullifier, EVENT_ID } from "@scripts";

const ENTRY_POINT = "0x820692eaD6ba469d76c6c443FA97fC8B5bef309A";
const SOME_TOKEN = "0x07ECE004fF33ce444f82F8d538A5687849Df67AC";
const ACCOUNT_FACTORY = "0x76C9b5c8Bc736e58F5b54BA721571c77059CAa68";

export = async (deployer: Deployer) => {
  const token = await deployer.deployed(ERC20Mock__factory, SOME_TOKEN);
  const entryPoint = await deployer.deployed(EntryPoint__factory, ENTRY_POINT);
  const accountFactory = await deployer.deployed(SmartAccountFactory__factory, ACCOUNT_FACTORY);

  const privateKey = BigInt("0x29176100eaa962bdc1fe6c654d6a3c130e96a4d1168b33848b897dc502820133");

  const userOperation = await getEmptyPackedUserOperation();
  const initCode = await getInitCode(accountFactory, buildNullifier(privateKey, EVENT_ID));

  await deployer.sendNative(initCode.predictedAddress, ethers.parseEther("1"));

  userOperation.sender = initCode.predictedAddress;
  userOperation.initCode = initCode.initCode;

  userOperation.callData = SmartAccount__factory.createInterface().encodeFunctionData(
    "execute(address,uint256,bytes)",
    [
      await token.getAddress(),
      0n,
      token.interface.encodeFunctionData("mint(address,uint256)", [initCode.predictedAddress, 1000n]),
    ],
  );

  const signedOp = await getSignedPackedUserOperation(entryPoint, privateKey, EVENT_ID, userOperation);

  await sendSignedPackedUserOperation(entryPoint, signedOp);
};
