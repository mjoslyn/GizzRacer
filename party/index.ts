import { routePartykitRequest } from 'partyserver';

export { Players } from './players';
export { Room } from './room';
export { Trials } from './trials';

/** Routes /parties/{party}/{name}/... to the PartyKit servers; everything else is the game's static files. */
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    return (await routePartykitRequest(req, env)) ?? new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
