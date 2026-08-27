import type { ValueProvider } from "@nestjs/common";

declare const resolvedService: unique symbol;

/**
 * A Nest injection token that remembers which application service it resolves to.
 *
 * The services in `@destaworks/application` are plain singleton objects, not Nest classes, so
 * there is no constructor to inject by type. A bare `symbol` token would leave both ends of the
 * wiring untyped: nothing would stop a module binding `CANDIDATE_SERVICE` to the lead service, or
 * a controller declaring the wrong parameter type for it.
 */
export type ServiceToken<TService> = symbol & { readonly [resolvedService]: TService };

/** The service a token resolves to — for typing the constructor parameter that injects it. */
export type ServiceOf<TToken> = TToken extends ServiceToken<infer TService> ? TService : never;

/** Mint a token for one application service. The description is what Nest prints on a DI failure. */
export function serviceToken<TService>(description: string): ServiceToken<TService> {
  // A symbol carries no type argument at runtime, so the brand cannot be produced by construction.
  // It is phantom: erased at compile time, never read, and exists only to pair a token with the
  // service type the container will hand back.
  return Symbol(description) as ServiceToken<TService>;
}

/** Bind a token to its service. Wrong pairings fail to compile rather than at the first request. */
export function provideService<TService>(
  token: ServiceToken<TService>,
  service: TService,
): ValueProvider<TService> {
  return { provide: token, useValue: service };
}
