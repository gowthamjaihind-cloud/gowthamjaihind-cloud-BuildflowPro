with open("src/components/EnterpriseAuthView.tsx", "r") as f:
    text = f.read()

text = text.replace("getDocs, getDoc, updateDoc,", "getDocs, getDoc,")

with open("src/components/EnterpriseAuthView.tsx", "w") as f:
    f.write(text)
