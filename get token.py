from bambulab import BambuAuthenticator
import getpass

print("=== Bambu Lab Token Generator ===")
print()
email    = input("Email: ")
password = getpass.getpass("Password (hidden): ")

print("\nLogging in... (check your email for a verification code)")

auth  = BambuAuthenticator()
token = auth.login(email, password)

print("\n✓ Your token:")
print(token)
print("\nCopy the token above and paste it into the dashboard login form.")
print("This token lasts ~3 months before you need to run this again.")