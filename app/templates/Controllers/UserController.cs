using System;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;

namespace slush_marklogic_dotnet_appserver.Controllers
{
    [Route("api/[controller]")]
    public class UserController : Controller
    {

        [HttpPost("[action]")]
        public UserViewModel Login([FromBody] UserViewModel user)
        {
            // Here you'll pass along the credentials like the node layer does
            // and set authenticated = true.  Store this information in the Session.
            user.authenticated = true;
            HttpContext.Session.SetString("user.username", user.username);
            HttpContext.Session.SetString("user.password", user.password);
            HttpContext.Session.SetString("user.authenticated", "true");
            return user;
        }

        [HttpGet("[action]")]
        public void Logout()
        {
            // Here you'll log the user out.  Clear the Session data and return 
            // the proper data like node does.
            HttpContext.Session.Clear();
        }


        [HttpGet("[action]")]
        public UserViewModel Status()
        {
            // Do a similar status check here.  Grab it from the Session.
            UserViewModel model = new UserViewModel();
            model.authenticated = false;
            string auth = HttpContext.Session.GetString("user.authenticated");
            if(auth != null){
                if(auth.Equals("true")) {
                    model.username = HttpContext.Session.GetString("user.username");
                    model.authenticated = true;
                }
            }

            return model;
        }


    }
}
