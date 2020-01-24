/**
 * SPID Passport strategy
 */
import { array } from "fp-ts/lib/Array";
import { taskEither, TaskEither } from "fp-ts/lib/TaskEither";
import { Profile, SamlConfig, VerifiedCallback } from "passport-saml";
// tslint:disable-next-line: no-submodule-imports
import * as MultiSamlStrategy from "passport-saml/multiSamlStrategy";
import { SPID_IDP_IDENTIFIERS } from "../config";
import getCieIpdOption from "../testIdpsConfig/xx_servizicie_test";
import getSpidTestIpdOption from "../testIdpsConfig/xx_testenv2";
import { IDPEntityDescriptor } from "../types/IDPEntityDescriptor";
import { fetchIdpsMetadata } from "../utils/idpLoader";
import { logger } from "../utils/logger";
import {
  getSamlOptions,
  logSamlCertExpiration,
  SamlAttributeT
} from "../utils/saml";

export interface IServiceProviderConfig {
  requiredAttributes: {
    attributes: ReadonlyArray<SamlAttributeT>;
    name: string;
  };
  spidTestEnvUrl: string;
  IDPMetadataUrl: string;
  organization: {
    URL: string;
    displayName: string;
    name: string;
  };
  publicCert: string;
  hasSpidValidatorEnabled: boolean;
}

export interface ISpidStrategyOptions {
  idp: { [key: string]: IDPEntityDescriptor | undefined };
  // tslint:disable-next-line: no-any
  sp: SamlConfig;
}

export const getSpidStrategyOptionsUpdater = (
  samlConfig: SamlConfig,
  serviceProviderConfig: IServiceProviderConfig
): (() => TaskEither<Error, ISpidStrategyOptions>) => () => {
  const idpOptionsTasks = [
    fetchIdpsMetadata(
      serviceProviderConfig.IDPMetadataUrl,
      SPID_IDP_IDENTIFIERS
    )
  ].concat(
    serviceProviderConfig.hasSpidValidatorEnabled
      ? [
          fetchIdpsMetadata("http://spid-saml-check:8080/metadata.xml", {
            // TODO: must be a configuration param
            // "https://validator.spid.gov.it": "xx_validator"
            "http://localhost:8080": "xx_validator"
          })
        ]
      : []
  );
  return array
    .sequence(taskEither)(idpOptionsTasks)
    .map(idpOptionsRecords =>
      idpOptionsRecords.reduce((prev, current) => ({ ...prev, ...current }), {})
    )
    .map(idpOptionsRecord => {
      logSamlCertExpiration(serviceProviderConfig.publicCert);
      return {
        idp: {
          ...idpOptionsRecord,
          xx_servizicie_test: getCieIpdOption(),
          xx_testenv2: getSpidTestIpdOption(
            serviceProviderConfig.spidTestEnvUrl
          )
        },
        sp: {
          ...samlConfig,
          attributes: {
            attributes: serviceProviderConfig.requiredAttributes,
            name: "Required attributes"
          },
          identifierFormat:
            "urn:oasis:names:tc:SAML:2.0:nameid-format:transient",
          organization: serviceProviderConfig.organization,
          signatureAlgorithm: "sha256"
        }
      };
    });
};

export const makeSpidStrategy = (options: ISpidStrategyOptions) => {
  return new MultiSamlStrategy(
    { ...options, getSamlOptions, passReqToCallback: true },
    (req: Express.Request, profile: Profile, done: VerifiedCallback) => {
      // TODO: remove
      logger.debug("SPID request:", JSON.stringify(req));
      logger.debug("getAssertionXml:%s", profile.getAssertionXml());
      logger.debug("profile", JSON.stringify(profile));

      // passport callback that returns
      // success (verified) or failure
      done(null, profile);
    }
  );
};