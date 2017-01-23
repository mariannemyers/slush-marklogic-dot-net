namespace slush_marklogic_dotnet_appserver
{
    public class UserViewModel
    {

        public UserViewModel () {
          authenticated = false;     
        }
        public string username { get; set; }
        public string password { get; set; }
        public bool authenticated { get; set; }
    }
}