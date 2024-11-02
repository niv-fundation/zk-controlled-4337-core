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

export = async (deployer: Deployer) => {
  const entryPoint = await deployer.deployed(EntryPoint__factory);
  const accountFactory = await deployer.deployed(SmartAccountFactory__factory, "SmartAccountFactoryProxy");

  const privateKey = BigInt("2683859904373824334341583944441165871856632302722023367041511169550141504364");

  const userOperation = await getEmptyPackedUserOperation();
  const initCode = await getInitCode(accountFactory, buildNullifier(privateKey, EVENT_ID));

  await deployer.sendNative(initCode.predictedAddress, ethers.parseEther("1"));

  userOperation.sender = initCode.predictedAddress;
  userOperation.initCode = initCode.initCode;

  userOperation.callData = SmartAccount__factory.createInterface().encodeFunctionData(
    "execute(address,uint256,bytes)",
    ["0xb85c7dca274328bc69e39e21273BBbAF5776a352", 1000000000000000000n, "0x"],
  );

  console.log(await entryPoint.getAddress(), privateKey, EVENT_ID);

  const signedOp = await getSignedPackedUserOperation(entryPoint, privateKey, EVENT_ID, userOperation);

  console.log("userOperation", signedOp);

  await sendSignedPackedUserOperation(entryPoint, signedOp);
};
