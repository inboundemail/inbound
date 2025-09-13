# Build your own integration

> Learn how to authenticate users with OAuth 2.0. for your Dub integration.

Integrations allow you to extend the capabilities of Dub and seamlessly connect with third-party platforms and services.

You can build your own integrations with Dub using our [API](/api-reference/introduction).

1. Read the documentation on how to [create links](/api-reference/endpoint/create-a-link) or [track sale conversions](/api-reference/endpoint/track-sale).
2. Learn how to [integrate Dub into your application](/integrations/quickstart).
3. [Reach out to us](https://dub.co/contact/support) to feature your integration in the integrations marketplace.

In this guide, you will learn how to create and manage integrations on Dub, allowing you to incorporate Dub's link attribution platform into your application.

## Integrating via OAuth 2.0 (recommended)

Dub supports OAuth 2.0 authentication, which is **recommended** if you build integrations extending Dub's functionality.

We recommend you use a OAuth client library to integrate the OAuth flow. You can find recommended libraries in a variety of programming languages [here](https://oauth.net/code/).

### Set up OAuth 2.0

Here is a step-by-step guide on how to set up OAuth 2.0 authentication with Dub.

<Steps>
  <Step title="Create an OAuth2 application in Dub">
    * Go to the [OAuth Apps tab](https://app.dub.co/settings/oauth-apps) in your workspace.
    * Click on **Create OAuth App**.
    * Fill in the required fields to create an OAuth2 application.
  </Step>

  <Step title="Redirect users to authorization URL">
    When you want to authenticate a user, you need to redirect them to the Dub OAuth authorization URL.

    ```
    GET https://app.dub.co/oauth/authorize
    ```

    Parameters:

    | Property        | Description                                                                                                                       |
    | --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
    | `client_id`     | The client ID of your OAuth application.                                                                                          |
    | `redirect_uri`  | The URL to redirect the user to after they authorize the application. Make sure this URL is registered in your OAuth application. |
    | `response_type` | Expected response type. It should be `code`.                                                                                      |
    | `scope`         | A space separated list of scopes that you want to request access to. Read more about scopes [here](#scopes).                      |
    | `state`         | The state parameter to prevent against CSRF attacks. Read more about it [here](https://auth0.com/docs/protocols/state-parameters) |

    An example URL would look like this:

    ```
    GET https://app.dub.co/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI&response_type=code&scope=SOME_SCOPE&state=SOME_STATE
    ```

    <Frame>
      <img src="https://mintcdn.com/dub/S5CJNHicyu5NWQ7r/images/oauth-consent.png?fit=max&auto=format&n=S5CJNHicyu5NWQ7r&q=85&s=9240c00da1818db1b5c240d525c6554e" alt="OAuth consent screen" width="1468" height="249" width="1074" height="680" data-path="images/oauth-consent.png" srcset="https://mintcdn.com/dub/S5CJNHicyu5NWQ7r/images/oauth-consent.png?w=280&fit=max&auto=format&n=S5CJNHicyu5NWQ7r&q=85&s=4e9640001e1826dd956c72a7582e3015 280w, https://mintcdn.com/dub/S5CJNHicyu5NWQ7r/images/oauth-consent.png?w=560&fit=max&auto=format&n=S5CJNHicyu5NWQ7r&q=85&s=cc99650cb31f495cb4c612c8ae77137b 560w, https://mintcdn.com/dub/S5CJNHicyu5NWQ7r/images/oauth-consent.png?w=840&fit=max&auto=format&n=S5CJNHicyu5NWQ7r&q=85&s=b5e9ed33187958fb7c972386f559334d 840w, https://mintcdn.com/dub/S5CJNHicyu5NWQ7r/images/oauth-consent.png?w=1100&fit=max&auto=format&n=S5CJNHicyu5NWQ7r&q=85&s=15014b57a6eb184b8f27898641c2867e 1100w, https://mintcdn.com/dub/S5CJNHicyu5NWQ7r/images/oauth-consent.png?w=1650&fit=max&auto=format&n=S5CJNHicyu5NWQ7r&q=85&s=0fcd01f7c9931531d78a3bcb59d9b729 1650w, https://mintcdn.com/dub/S5CJNHicyu5NWQ7r/images/oauth-consent.png?w=2500&fit=max&auto=format&n=S5CJNHicyu5NWQ7r&q=85&s=feef6629b46f9eae08efd878e86840f5 2500w" data-optimize="true" data-opv="2" />
    </Frame>
  </Step>

  <Step title="Exchange code for an access token">
    The `code` parameter is returned in the query string when the user is redirected back to your application. You can exchange this code for an access token by making a POST request to the Dub OAuth token URL.

    ```
    POST https://api.dub.co/oauth/token
    ```

    Here's an example using the fetch API:

    ```js
    await fetch("https://api.dub.co/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code: "YOUR_AUTHORIZATION_CODE",
        client_id: "YOUR_CLIENT_ID",
        client_secret: "YOUR_CLIENT_SECRET",
        redirect_uri: "YOUR_REDIRECT_URI",
        grant_type: "authorization_code",
      }),
    });
    ```

    <Warning>
      The `Content-Type` header should be set to `application/x-www-form-urlencoded`.
    </Warning>

    Parameters:

    | Property        | Description                                                                  |
    | --------------- | ---------------------------------------------------------------------------- |
    | `code`          | The code you received when the user was redirected back to your application. |
    | `client_id`     | The client ID of your OAuth application.                                     |
    | `client_secret` | The client secret of your OAuth application.                                 |
    | `redirect_uri`  | The same redirect URI you used in the authorization URL.                     |
    | `grant_type`    | The grant type. It should be `authorization_code`.                           |

    Response:

    After a successful request, you will receive a JSON response with the access token.

    ```json
    {
      "access_token": "dub_access_token_ae8ebf6f97e6200d886ef48a5...",
      "refresh_token": "7f5acfbe14bca0a20fe6e430ddb7bb494eed160bd...",
      "token_type": "Bearer",
      "expires_in": 7200,
      "scope": "links.write tags.write domains.read"
    }
    ```

    We recommend using the [PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce) flow for native desktop or mobile application or a single-page app (SPA) where the `client_secret` cannot be hidden.

    With PKCE, the `client_secret` is **never sent to the authorization server**, preventing the `client_secret` from being leaked from the client application.

    Instead of using the `client_secret`, you will need to generate a `code_verifier` and `code_challenge` and use them to exchange for an access token.

    For example [Dub Raycast extension](https://github.com/raycast/extensions/tree/main/extensions/dub) uses PKCE to authenticate users.
  </Step>

  <Step title="Make an API request with the access token">
    Once you have obtained a valid access token, you can use it to make requests to the Dub API.

    You can initialize [Dub SDK](/sdks/overview) with the access token.

    Here is an example of how you can create a link using the [Dub TypeScript SDK](/sdks/typescript):

    ```javascript
    import { Dub } from "dub";

    const dub = new Dub({
      token: <ACCESS_TOKEN>,
    });

    const link = await dub.links.create({
      url: "https://google.com",
    });
    ```

    Or pass the access token in the header: `Authorization: Bearer <ACCESS_TOKEN>`

    ```shell
      curl --request POST \
      --url https://api.dub.co/links \
      --header 'Authorization: Bearer <ACCESS_TOKEN>' \
      --header 'Content-Type: application/json'
    ```
  </Step>

  <Step title="Refresh the access token">
    Dub access tokens are short-lived, depending on the `expires_in` value (the default value is **7,200 seconds**, or **2 hours**). Dub will respond with `401 Unauthorized` if you try to use an expired access token.

    To refresh the access token, you need to make a POST request to the Dub OAuth token URL with the `refresh_token` you obtained when exchanging the code for an `access_token`.

    ```
    POST https://api.dub.co/oauth/token
    ```

    <Warning>
      The `Content-Type` header should be set to `application/x-www-form-urlencoded`.
    </Warning>

    Parameters:

    | Property        | Description                                                                  |
    | --------------- | ---------------------------------------------------------------------------- |
    | `client_id`     | The client ID of your OAuth application.                                     |
    | `client_secret` | The client secret of your OAuth application.                                 |
    | `grant_type`    | The grant type. It should be `refresh_token`.                                |
    | `refresh_token` | The refresh token you received when exchanging the code for an access token. |

    Response:

    After a successful request, you will receive a JSON response with the new access token.

    ```json
    {
      "access_token": "dub_access_token_ae8ebf6f97e6200d886ef48a5...",
      "refresh_token": "7f5acfbe14bca0a20fe6e430ddb7bb494eed160bd...",
      "token_type": "Bearer",
      "expires_in": 7200,
      "scope": "links.write tags.write domains.read"
    }
    ```

    This will invalidate the old access token and refresh token.
  </Step>
</Steps>

### Scopes

You can request access to specific scopes when redirecting users to the Dub OAuth authorization URL. Scopes are permissions that the user needs to grant to your application.

Dub supports the following scopes for OAuth 2.0:

| Scope              | Description                                                         |
| ------------------ | ------------------------------------------------------------------- |
| `workspaces.read`  | Read access to workspaces.                                          |
| `workspaces.write` | Write access to workspaces.                                         |
| `links.read`       | Read access to links.                                               |
| `links.write`      | Write access to links.                                              |
| `tags.read`        | Read access to tags.                                                |
| `tags.write`       | Write access to tags.                                               |
| `analytics.read`   | Read access to analytics.                                           |
| `domains.read`     | Read access to domains.                                             |
| `domains.write`    | Write access to domains.                                            |
| `user.read`        | Read access to user information. This scope is included by default. |

### Examples

<CardGroup cols={2}>
  <Card title="OAuth 2.0 Example" icon="github" href="https://github.com/dubinc/examples/tree/main/oauth" color="#333333">
    See the full example on GitHub.
  </Card>
</CardGroup>