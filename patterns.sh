patterns=(
  # '**'
  # '**/..'

  # # some of these aren't particularly "representative" of real-world
  # # glob patterns, but they're here to highlight pathological perf
  # # cases that I found while working on the rewrite of this library.
  # './**/0/**/0/**/0/**/0/**/*.txt'
  # './**/[01]/**/[12]/**/[23]/**/[45]/**/*.txt'
  # './**/0/**/0/**/*.txt'

  '**/*.txt'
  # '{**/*.txt,**/?/**/*.txt,**/?/**/?/**/*.txt,**/?/**/?/**/?/**/*.txt,**/?/**/?/**/?/**/?/**/*.txt}'
  # '**/5555/0000/*.txt'

  # './**/0/**/../[01]/**/0/../**/0/*.txt'
  # '**/????/????/????/????/*.txt'


  # './{**/?{/**/?{/**/?{/**/?,,,,},,,,},,,,},,,}/**/*.txt'


  # '**/!(0|9).txt'

  # './{*/**/../{*/**/../{*/**/../{*/**/../{*/**,,,,},,,,},,,,},,,,},,,,}/*.txt'
  # './*/**/../*/**/../*/**/../*/**/../*/**/../*/**/../*/**/../*/**/*.txt'
  # './*/**/../*/**/../*/**/../*/**/../*/**/*.txt'
  # './0/**/../1/**/../2/**/../3/**/../4/**/../5/**/../6/**/../7/**/*.txt'
  # './**/?/**/?/**/?/**/?/**/*.txt'
  # '**/*/**/*/**/*/**/*/**'
  # # '5555/0000/**/*.txt'
  # # '*/*/9/**/**/**/**/*/**/**/*.txt'
  # './**/*/**/*/**/*/**/*/**/*.txt'
  # '**/*.txt'
  # # './**/*.txt'
  # './**/**/**/**/**/**/**/**/*.txt'
  # '**/*/*.txt'
  # '**/*/**/*.txt'
  # '**/[0-9]/**/*.txt'
  # # '0/@([5-9]/*.txt|8/**)'
  # # '[0-9]/[0-9]/[0-9]/[0-9]/[0-9].txt'
  # # /**/**/**/**//////**/**//*.txt'
  # # '**/[5-9]/*.txt'
  # # '[678]/**/2.txt'
  # # '0/!(1|2)@(4|5)/**/**/**/**/*.txt'
  # # '0/!(1|2|@(4|5))/**/**/**/**/*.txt'
)
