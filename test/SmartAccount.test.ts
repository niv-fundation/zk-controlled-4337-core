import { expect } from "chai";
import { ethers } from "hardhat";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { Reverter } from "@test-helpers";
import { deployAA, deployEntryPoint } from "@deployment";

import { EntryPoint, SmartAccount, SmartAccount__factory, SmartAccountFactory } from "@ethers-v6";
import {
  executeViaEntryPoint,
  getDefaultPackedUserOperation,
  getEmptyPackedUserOperation,
  getInitCode,
  getSignedPackedUserOperation,
  sendSignedPackedUserOperation,
} from "@/test/helpers/aa-helper";
import { getInterfaceID } from "@solarity/hardhat-habits";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";

describe("SmartAccount", () => {
  const reverter = new Reverter();

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let entryPoint: EntryPoint;
  let accountFactory: SmartAccountFactory;

  let account: SmartAccount;

  before(async () => {
    [OWNER, SECOND] = await ethers.getSigners();

    entryPoint = await deployEntryPoint();
    accountFactory = await deployAA(entryPoint);

    await accountFactory.deploySmartAccount(OWNER.address);
    account = await ethers.getContractAt("SmartAccount", await accountFactory.getSmartAccount(OWNER.address));

    await setBalance(await account.getAddress(), ethers.parseEther("20"));

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("#Smart Account Factory", () => {
    it("should deploy a smart account and emit deployment event", async () => {
      const expectedAddress = await accountFactory.predictSmartAccountAddress(SECOND.address);

      await expect(accountFactory.deploySmartAccount(SECOND.address))
        .to.emit(accountFactory, "SmartAccountDeployed")
        .withArgs(expectedAddress);

      expect(await accountFactory.getSmartAccount(SECOND.address)).to.eq(expectedAddress);
    });

    it("should set new Smart Account implementation only by owner", async () => {
      const currentImplementation = await accountFactory.getSmartAccountImplementation();

      const SmartAccount = await ethers.getContractFactory("SmartAccount");
      const newImplementation = await SmartAccount.deploy(ethers.ZeroAddress);

      await expect(accountFactory.connect(SECOND).setSmartAccountImplementation(await newImplementation.getAddress()))
        .to.be.revertedWithCustomError(accountFactory, "OwnableUnauthorizedAccount")
        .withArgs(SECOND.address);

      await accountFactory.setSmartAccountImplementation(await newImplementation.getAddress());

      expect(await accountFactory.getSmartAccountImplementation()).to.eq(await newImplementation.getAddress());
      expect(await accountFactory.getSmartAccountImplementation()).to.not.eq(currentImplementation);
    });

    it("should upgrade Smart Account Factory implementation only by owner", async () => {
      const currentImplementation = await accountFactory.implementation();

      const SmartAccountFactory = await ethers.getContractFactory("SmartAccountFactory");
      const newImplementation = await SmartAccountFactory.deploy();

      await expect(accountFactory.connect(SECOND).upgradeToAndCall(await newImplementation.getAddress(), "0x"))
        .to.be.revertedWithCustomError(accountFactory, "OwnableUnauthorizedAccount")
        .withArgs(SECOND.address);

      await accountFactory.upgradeToAndCall(await newImplementation.getAddress(), "0x");

      expect(await accountFactory.implementation()).to.eq(await newImplementation.getAddress());
      expect(await accountFactory.implementation()).to.not.eq(currentImplementation);
    });

    it("should revert if trying to initialize factory twice", async () => {
      await expect(accountFactory.__SmartAccountFactory_init(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        accountFactory,
        "InvalidInitialization",
      );
    });
  });

  describe("#Smart Account", () => {
    it("should call the destination contract through the entrypoint and revert if call is failing", async () => {
      await executeViaEntryPoint(
        entryPoint,
        account,
        OWNER,
        await accountFactory.getAddress(),
        accountFactory.interface.encodeFunctionData("deploySmartAccount", [SECOND.address]),
        0n,
      );

      await expect(
        account.execute(
          await accountFactory.getAddress(),
          0n,
          accountFactory.interface.encodeFunctionData("deploySmartAccount", [SECOND.address]),
        ),
      )
        .to.be.revertedWithCustomError(account, "CallFailed")
        .withArgs("0x");
    });

    it("should revert if trying to call account not from owner or entry point", async () => {
      await expect(
        account
          .connect(SECOND)
          .execute(
            await accountFactory.getAddress(),
            0n,
            accountFactory.interface.encodeFunctionData("deploySmartAccount", [SECOND.address]),
          ),
      )
        .to.be.revertedWithCustomError(account, "NotFromEntryPointOrOwner")
        .withArgs(SECOND.address);
    });

    it("should revert if signer is invalid", async () => {
      await expect(
        executeViaEntryPoint(
          entryPoint,
          account,
          SECOND,
          await accountFactory.getAddress(),
          accountFactory.interface.encodeFunctionData("deploySmartAccount", [SECOND.address]),
          0n,
        ),
      )
        .to.be.revertedWithCustomError(entryPoint, "FailedOp")
        .withArgs(0, "AA24 signature error");
    });

    it("should deploy account and execute operation", async () => {
      const ERC20 = await ethers.getContractFactory("ERC20Mock");
      const token = await ERC20.deploy("Token", "TKN", 18);

      const userOperation = await getEmptyPackedUserOperation();
      const initCode = await getInitCode(accountFactory, SECOND.address);

      await setBalance(initCode.predictedAddress, ethers.parseEther("20"));

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

      const signedOp = await getSignedPackedUserOperation(entryPoint, SECOND, userOperation);

      await sendSignedPackedUserOperation(entryPoint, signedOp);

      expect(await token.balanceOf(initCode.predictedAddress)).to.eq(1000n);
    });

    it("should revert if nonce is not valid", async () => {
      const nonSignedOp = await getDefaultPackedUserOperation(account);
      nonSignedOp.nonce = ethers.MaxUint256 - 2n;
      const signedOp = await getSignedPackedUserOperation(entryPoint, OWNER, nonSignedOp);

      await expect(sendSignedPackedUserOperation(entryPoint, signedOp))
        .to.be.revertedWithCustomError(entryPoint, "FailedOpWithRevert")
        .withArgs(0, "AA23 reverted", "0xb1373a6cfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffd");
    });

    it("should revert if trying to validate User Operation not from entrypoint", async () => {
      const nonSignedOp = await getDefaultPackedUserOperation(account);

      await expect(account.validateUserOp(nonSignedOp, ethers.ZeroHash, 0n))
        .to.be.revertedWithCustomError(account, "NotFromEntryPoint")
        .withArgs(OWNER.address);
    });

    it("should not pay back if missing funds is zero", async () => {
      await impersonateAccount(await entryPoint.getAddress());
      const entryPointAsSigner = await ethers.provider.getSigner(await entryPoint.getAddress());
      await setBalance(await entryPoint.getAddress(), ethers.parseEther("20"));

      const nonSignedOp = await getDefaultPackedUserOperation(account);
      const signedOp = await getSignedPackedUserOperation(entryPoint, OWNER, nonSignedOp);
      const hashOp = await entryPoint.getUserOpHash(signedOp);

      expect(await account.connect(entryPointAsSigner).validateUserOp.staticCall(signedOp, hashOp, 0n)).to.be.eq(0n);

      await expect(account.connect(entryPointAsSigner).validateUserOp(signedOp, hashOp, 0n)).to.be.fulfilled;
    });

    it("should support relevant interfaces", async () => {
      expect(await account.supportsInterface(await getInterfaceID("IAccount"))).to.be.true;
      expect(await account.supportsInterface(await getInterfaceID("IERC165"))).to.be.true;
    });

    it("should upgrade Smart Account implementation only by owner", async () => {
      const currentImplementation = await account.implementation();

      const SmartAccount = await ethers.getContractFactory("SmartAccount");
      const newImplementation = await SmartAccount.deploy(ethers.ZeroAddress);

      await expect(account.connect(SECOND).upgradeToAndCall(await newImplementation.getAddress(), "0x"))
        .to.be.revertedWithCustomError(account, "NotFromThis")
        .withArgs(SECOND.address);

      await account.execute(
        await account.getAddress(),
        0n,
        account.interface.encodeFunctionData("upgradeToAndCall", [await newImplementation.getAddress(), "0x"]),
      );

      expect(await account.implementation()).to.eq(await newImplementation.getAddress());
      expect(await account.implementation()).to.not.eq(currentImplementation);
    });

    it("should revert if trying to initialize factory twice", async () => {
      await expect(account.__SmartAccount_init(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        account,
        "InvalidInitialization",
      );
    });
  });
});
