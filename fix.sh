awk '
{
  if ($0 == "    try {") {
    if (try_count == 0) {
      print $0
      try_count = 1
    }
  } else if ($0 == "    }") {
    if (close_count == 0) {
      print $0
      close_count = 1
    } else {
      # skip the second one if we just skipped try
      print $0
    }
  } else {
    print $0
  }
}' src/components/ProgressReportsView.tsx > temp.tsx
mv temp.tsx src/components/ProgressReportsView.tsx
