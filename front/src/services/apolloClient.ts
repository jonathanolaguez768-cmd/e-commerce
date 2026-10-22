import { ApolloClient, HttpLink, InMemoryCache, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';

const graphqlUrl = import.meta.env.PUBLIC_GRAPHQL_URL;

const wsUrl = graphqlUrl.replace(/^http/, 'ws');

const httpLink = new HttpLink({
  uri: graphqlUrl,
  credentials: 'include',
});

const wsLink = new GraphQLWsLink(
  createClient({
    url: wsUrl,
  })
);

const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    );
  },
  wsLink,
  httpLink
);

export const client = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
});
