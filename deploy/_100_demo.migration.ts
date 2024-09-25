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

const ENTRY_POINT = "0xC1ECEd7578cDcED435717BDF3a667D3cf418bE0C";
const SOME_TOKEN = "0xB7e34aEB1ba4E2C270d27e980Ba47BaABb34DD09";
const ACCOUNT_FACTORY = "0x9aEA6E9504cCA01B267dAc45e0cC2883F8c0ae31";

export = async (deployer: Deployer) => {
  const token = await deployer.deployed(ERC20Mock__factory, SOME_TOKEN);
  const entryPoint = await deployer.deployed(EntryPoint__factory, ENTRY_POINT);
  const accountFactory = await deployer.deployed(SmartAccountFactory__factory, ACCOUNT_FACTORY);

  const signer = await deployer.getSigner();

  const userOperation = await getEmptyPackedUserOperation();
  const initCode = await getInitCode(accountFactory, await signer.getAddress());

  await deployer.sendNative(initCode.predictedAddress, ethers.parseEther("0.1"));

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

  // const signedOp = await getSignedPackedUserOperation(entryPoint, signer as any, userOperation);
  //
  // await sendSignedPackedUserOperation(entryPoint, signedOp);
};
