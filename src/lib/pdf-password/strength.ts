// A hint about how hard a password is to guess. It is advice, never a rule: the
// form lets a weak password through. Pure.

export type Strength = "empty" | "weak" | "fair" | "strong";

// A few of the passwords people pick most. Not a dictionary, just the obvious ones
// a hint should not call fair.
const COMMON = new Set([
	"password",
	"password1",
	"passw0rd",
	"qwerty",
	"qwerty123",
	"letmein",
	"welcome",
	"iloveyou",
	"admin",
	"abc123",
	"123456",
	"12345678",
	"123456789",
	"1234567890",
	"111111",
	"000000",
]);

const classesOf = (password: string): number =>
	[/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((kind) => kind.test(password))
		.length;

const isSingleRepeat = (password: string) =>
	password.length > 0 && new Set(password).size === 1;

export const passwordStrength = (password: string): Strength => {
	if (password === "") return "empty";

	if (COMMON.has(password.toLowerCase()) || isSingleRepeat(password)) {
		return "weak";
	}

	const classes = classesOf(password);

	// A long passphrase beats a short mix of symbols.
	if (password.length >= 16) return "strong";

	if (password.length >= 12 && classes >= 2) return "strong";

	if (password.length >= 8 && classes >= 2) return "fair";

	if (password.length >= 12) return "fair";

	return "weak";
};
