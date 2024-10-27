import { Deployer, Reporter } from "@solarity/hardhat-migrate";

import {
  ERC1967Proxy__factory,
  IdentityAuthVerifier__factory,
  SmartAccount__factory,
  SmartAccountFactory__factory,
} from "@ethers-v6";

const ENTRY_POINT = "0x64B38172fF8D960305a4B9cD372415fEb26aF676";

export = async (deployer: Deployer) => {
  let accountFactory = await deployer.deploy(SmartAccountFactory__factory);
  const proxy = await deployer.deploy(ERC1967Proxy__factory, [await accountFactory.getAddress(), "0x"]);
  accountFactory = await deployer.deployed(SmartAccountFactory__factory, await proxy.getAddress());

  const identityAuthVerifier = await deployer.deploy(IdentityAuthVerifier__factory);

  const accountImplementation = await deployer.deploy(SmartAccount__factory, [
    ENTRY_POINT,
    await identityAuthVerifier.getAddress(),
  ]);

  await accountFactory.__SmartAccountFactory_init(await accountImplementation.getAddress());

  Reporter.reportContracts(["SmartAccountFactory", await accountFactory.getAddress()]);
};
