awk '
{
  if (index($0, "<Trash2 className=\"w-4 h-4\" />") > 0) {
    print
    getline
    print
    getline
    print
    print "                        )}"
  } else {
    print
  }
}' src/components/ProgressReportsView.tsx > temp.tsx
mv temp.tsx src/components/ProgressReportsView.tsx
