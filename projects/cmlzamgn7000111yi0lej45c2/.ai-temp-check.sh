if [ -f index.html ]; then grep -q '<h1>привет мир</h1>' index.html && echo 'OK' || exit 1; else exit 1; fi
