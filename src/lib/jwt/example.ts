// The token behind "Try an example". It is signed with HS256 and `EXAMPLE_SECRET`,
// and expires in 2100 so the page never opens on a stale example.
//
// header   {"alg":"HS256","typ":"JWT"}
// payload  {"iss":"https://palico.rangga.site","sub":"user_42","aud":"palico-demo",
//           "name":"Palico","role":"adventurer","iat":1767225600,"nbf":1767225600,
//           "exp":4102444800,"jti":"3f2b8c1e"}

export const EXAMPLE_SECRET = "palico-demo";

export const EXAMPLE_TOKEN =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3BhbGljby5yYW5nZ2Euc2l0ZSIsInN1YiI6InVzZXJfNDIiLCJhdWQiOiJwYWxpY28tZGVtbyIsIm5hbWUiOiJQYWxpY28iLCJyb2xlIjoiYWR2ZW50dXJlciIsImlhdCI6MTc2NzIyNTYwMCwibmJmIjoxNzY3MjI1NjAwLCJleHAiOjQxMDI0NDQ4MDAsImp0aSI6IjNmMmI4YzFlIn0.QvvS9SnUb6cSlVVoGABCQz9tIvLkNe-8KDEAh5UvaRQ";
