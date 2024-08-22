# Setup
* run docker.sh (start/stop/restart/daemon)

  * Follow structure to add new regions.
  * Region keys MUST be all caps
  * Use settings.json to enable/disable widget mode

# API
* To access the api go to:
    - http://\<ip>:\<port>/\<region>/\<class>
* For example - street 2 in flr region:
    - http://192.168.1.10:8000/flr/S2
* To access national tour live timing: 
    - http://\<ip>:\<port>/tour/\<class>

# Widget
* Using KWGT, import Autocross.kwgt in Widget directory
* Using Tasker, import Autocross_Data.tsk.xml

